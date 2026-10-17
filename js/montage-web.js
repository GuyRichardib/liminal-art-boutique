/*
 * montage-web.js — the approved Liminal Ink page-turn composition, one engine for every sampler book.
 *
 * Lineage. Authored by Claude Opus 5.5 for Little Impossible Shops (05/10); mask layer corrected by Codex (06/10,
 * release-20261006/montage.js); adapted by Codex to Observatory, Sacred Japan and Mythical (06/10, motion-series-20261006,
 * adapt_montage.py: only cover aspect, art box, sources, three ink colours, hook caption, masks/regions and camera 'A'
 * overrides changed); web patches of 17/10 (canvas found by data attribute, sources capped at 540 px by D-006, mask canvas
 * 420 px, background painted once and cached, smoothing 'medium', palette preview from shaded colour layers laid by a
 * 35-degree marker sweep). 17/10 evening: everything that differed between books moved into one config per book
 * (/js/books/<slug>.json); the drawing code is the 17/10 web copy, line for line. Known-answer control:
 * proofs/montage-engine/ (Shops frames of the old and new engine, same canvas size).
 *
 * Config: window.BOOK_FILM (object) if the page set it, else /js/books/<data-book of the canvas, default shops>.json.
 * Palette preview, per colour group i: shaded colour layer <media>/film-colour-i.png swept in (needs film-colour.json);
 * else the release behaviour, mask <media>/mask-i.png clipping a flat radial colour; else the line art alone.
 *
 * Contract
 *   window.ready                      Promise; resolves once the config is read, every image is decoded and fonts are
 *                                     settled; rejects when a required image (cover, pages, line art) is missing or a
 *                                     page image is taller than the D-006 cap (the page then stays on its floor).
 *   window.renderFrame(t, {width, height})
 *                                     Pure function of (t, width, height). No playback history, no clock,
 *                                     no randomness, no network. Supports 1080x1920, 1080x1080, 1920x1080
 *                                     (other sizes fall back to the nearest designed layout, letterboxed).
 *   window.MONTAGE                    { duration, sizes, slug, config, colourMode, warp, tEnd, filmTime(p) } — filmTime
 *                                     maps scroll progress 0..1 to film seconds (the book's warp; see deriveWarp).
 *
 * Only supplied real images are drawn. Pages are drawn whole (printed heading, caption, footer and white
 * border intact). The palette preview paints UNDER the unchanged native line image, which is composited on top
 * with "multiply" so every stroke stays the original pixel line.
 */
(function () {
  'use strict';

  /* ------------------------------------------------------------------ book (filled by configure) */

  var CFG = null;
  var DURATION = 20;
  var PAGE_W = 1224, PAGE_H = 1584, HR = PAGE_H / PAGE_W;   // printed page, width = 1 page unit
  var COVER_AR = 1426 / 1103;                               // cover height / width
  var ART = { x: 0, y: 0, w: 1, h: HR };                    // line art box on the printed page, page-width units
  var SRC = {};
  var IMG = {};
  var TURNS = [], CAMK = [[0, 'R'], [DURATION, 'R']];
  var COLOR_START = 14.0, BOOK_IN = [2.30, 3.25], BOOK_OUT = [17.50, 18.20], COVER_OUT = [2.20, 3.10], COVER_IN = [17.70, 18.50];
  var CAPTIONS = [], REGIONS = [], COLOURED = null;
  var MASK_W = 1, MASK_H = 1, REGION_DUR = 0.62, RREACH = 1, SWEEP = 0.78;
  var MC_W = 420, MC_H = 544;
  var FBB = null, LAYER_W = 417, LAYER_H = 540, COLOUR_MODE = 'none';
  var WARP = [[0, 0], [1, 0]], T_END = 0;

  var SERIF = '"Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif';
  var SANS = '"Avenir Next", "Segoe UI", "Helvetica Neue", Arial, sans-serif';

  var COL = {
    ivory: '#F4EEE3',
    sheet: '#F7F3EB',
    sheetEdge: '#ECE5D7',
    forest: '#2F4636',
    amber: '#A8742F',
    muted: '#5F6656'
  };

  /* ------------------------------------------------------------------ timing helpers */

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function seg(t, a, b) { return clamp((t - a) / (b - a), 0, 1); }
  function lerp(a, b, x) { return a + (b - a) * x; }
  function eio(x) { return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; }
  function eout(x) { return 1 - Math.pow(1 - x, 3); }
  function esine(x) { return 0.5 - 0.5 * Math.cos(Math.PI * x); }

  /* ------------------------------------------------------------------ layouts */

  function focus(u, v, sx, sy, pw) { return { hx: sx - u * pw, ty: sy - v * pw, pw: pw }; }

  // Camera states: hx = screen x of the page hinge (left edge of the right-hand page), ty = page top,
  // pw = page width in px. Coordinates are in the layout's base pixel space. A book may override any state
  // (config camera_overrides, e.g. Sacred Japan's 'A'), as the 06/10 adaptations did.
  function baseLayouts() {
    return {
      vertical: {
        w: 1080, h: 1920,
        cam: {
          R: { hx: 110, ty: 330, pw: 860 },
          S: { hx: 340, ty: 420, pw: 720 },
          D: focus(0.49, 0.60, 540, 900, 1750),
          D2: focus(0.54, 0.68, 540, 900, 1830),
          A: { hx: -60, ty: 95, pw: 1200 }
        },
        cover: { cx: 540, cy: 820, w: 800 },
        exitX: 1150, enterX: 1100,
        capCover: { x: 540, y: 1432, align: 'center', anchor: 'top', maxW: 920, size: 64, ks: 24 },
        capBook: { x: 540, y: 1540, align: 'center', anchor: 'top', maxW: 920, size: 62, ks: 24 },
        capLabel: { x: 540, y: 1592, align: 'center', anchor: 'top', maxW: 920, size: 0, ks: 24 }
      },
      square: {
        w: 1080, h: 1080,
        cam: {
          R: { hx: 240, ty: 62, pw: 600 },
          S: { hx: 420, ty: 118, pw: 540 },
          D: focus(0.49, 0.60, 540, 500, 1250),
          D2: focus(0.54, 0.68, 540, 500, 1310),
          A: { hx: 140, ty: -50, pw: 800 }
        },
        cover: { cx: 540, cy: 430, w: 540 },
        exitX: 950, enterX: 900,
        capCover: { x: 540, y: 830, align: 'center', anchor: 'top', maxW: 940, size: 48, ks: 19 },
        capBook: { x: 540, y: 888, align: 'center', anchor: 'top', maxW: 940, size: 48, ks: 19 },
        capLabel: { x: 540, y: 942, align: 'center', anchor: 'top', maxW: 940, size: 0, ks: 19 }
      },
      landscape: {
        w: 1920, h: 1080,
        cam: {
          R: { hx: 560, ty: 100, pw: 680 },
          S: { hx: 720, ty: 152, pw: 600 },
          D: focus(0.49, 0.60, 860, 540, 1500),
          D2: focus(0.54, 0.68, 860, 540, 1560),
          A: { hx: 410, ty: -64, pw: 900 }
        },
        cover: { cx: 700, cy: 540, w: 640 },
        exitX: 1200, enterX: 1500,
        capCover: { x: 1130, y: 540, align: 'left', anchor: 'middle', maxW: 620, size: 60, ks: 22 },
        capBook: { x: 1388, y: 540, align: 'left', anchor: 'middle', maxW: 420, size: 54, ks: 22 },
        capLabel: { x: 1388, y: 540, align: 'left', anchor: 'middle', maxW: 420, size: 0, ks: 22 }
      }
    };
  }
  var LAYOUTS = baseLayouts();

  function pickLayout(W, H) {
    var r = W / H;
    var L = r < 0.75 ? LAYOUTS.vertical : (r > 1.4 ? LAYOUTS.landscape : LAYOUTS.square);
    var s = Math.min(W / L.w, H / L.h);
    return { L: L, s: s, ox: (W - L.w * s) / 2, oy: (H - L.h * s) / 2 };
  }

  function camAt(t, L) {
    var k = 0;
    while (k < CAMK.length - 2 && t >= CAMK[k + 1][0]) k++;
    var a = L.cam[CAMK[k][1]], b = L.cam[CAMK[k + 1][1]];
    var x = eio(seg(t, CAMK[k][0], CAMK[k + 1][0]));
    return { hx: lerp(a.hx, b.hx, x), ty: lerp(a.ty, b.ty, x), pw: lerp(a.pw, b.pw, x) };
  }

  /* ------------------------------------------------------------------ config */

  function num2(v, fallback) {               // a number, or [a, b] meaning a / b (keeps the original arithmetic exact)
    if (v == null) return fallback;
    return (typeof v === 'number') ? v : v[0] / v[1];
  }

  function configure(cfg) {
    if (!cfg || !cfg.turns || !cfg.media) throw new Error('montage: book config without turns or media');
    CFG = cfg;
    DURATION = cfg.duration || 20;
    var pp = cfg.page_px || [1224, 1584];
    PAGE_W = pp[0]; PAGE_H = pp[1]; HR = PAGE_H / PAGE_W;
    COVER_AR = num2(cfg.cover_aspect, 1426 / 1103);
    var a = cfg.art;
    if (a.pt) {   // the line art's bbox on the PDF page (points), divided by the page WIDTH for both axes
      var pw = a.page_pt_w || 612;
      ART = { x: a.pt[0] / pw, y: a.pt[1] / pw, w: (a.pt[2] - a.pt[0]) / pw, h: (a.pt[3] - a.pt[1]) / pw };
    } else {
      ART = { x: a.x, y: a.y, w: a.w, h: a.h };
    }
    var t = cfg.timeline || {};
    if (t.color_start != null) COLOR_START = t.color_start;
    if (t.book_in) BOOK_IN = t.book_in;
    if (t.book_out) BOOK_OUT = t.book_out;
    if (t.cover_out) COVER_OUT = t.cover_out;
    if (t.cover_in) COVER_IN = t.cover_in;
    TURNS = cfg.turns;
    CAMK = cfg.camera;
    COLOURED = cfg.coloured;
    CAPTIONS = cfg.captions || [];
    var c = cfg.colors || {};
    if (c.forest) COL.forest = c.forest;
    if (c.amber) COL.amber = c.amber;
    if (c.muted) COL.muted = c.muted;

    LAYOUTS = baseLayouts();
    var ov = cfg.camera_overrides || {};
    Object.keys(ov).forEach(function (lay) {
      Object.keys(ov[lay]).forEach(function (key) {
        var v = ov[lay][key];
        LAYOUTS[lay].cam[key] = v.focus ? focus(v.focus[0], v.focus[1], v.focus[2], v.focus[3], v.focus[4]) : v;
      });
    });

    var pal = cfg.palette || {};
    REGIONS = pal.regions || [];
    var ms = pal.mask_space || cfg.art_px;
    MASK_W = ms[0]; MASK_H = ms[1];
    REGION_DUR = pal.region_dur != null ? pal.region_dur : 0.62;
    RREACH = typeof pal.radial_reach === 'number' ? pal.radial_reach : Math.hypot(MASK_W, MASK_H);
    SWEEP = pal.sweep != null ? pal.sweep : 0.78;
    // web copy: the mask canvas only needs the displayed art's resolution (art capped at 540 px high by D-006); 1030 px
    // cost up to 250 ms per frame while scrolling (17/10 measure)
    MC_W = pal.mask_canvas_w || 420;
    MC_H = Math.round(MC_W * cfg.art_px[1] / cfg.art_px[0]);

    var m = cfg.media, base = m.base;
    SRC = { cover: base + m.cover, art: base + m.art };
    Object.keys(m.pages).forEach(function (k) { SRC[k] = base + m.pages[k]; });
    deriveWarp();
  }

  /* ------------------------------------------------------------------ scroll warp */

  // Scroll is not a clock (round-3 critic of 17/10: the cover left in 5 frames, then nothing moved for 17). Each motion of
  // the film gets its own stretch of thumb and the idle seconds pass quickly. A book may carry its own hand-made warp
  // (Shops, 17/10); otherwise it is derived from this book's own timeline: motion = the cover dealt aside and the book
  // arriving, every page turn, every camera move between two different states, the palette sweeps; a second of motion
  // costs 1 unit of thumb, an idle second IDLE units (0.46 = the single rate that best reproduces the Shops hand warp,
  // proofs/montage-engine/WARP_FIT.json). The track ends just before the palette preview ends (its label starts to fade
  // at tout - 0.4 s; T_END = tout - 0.25 s, = 17.2 s for Shops), never on the closing cover; past the end it holds T_END.
  var IDLE = 0.46;
  function paletteEnd() {
    var s = CFG.scroll || {};
    if (s.t_end != null) return s.t_end;
    for (var i = 0; i < CAPTIONS.length; i++) if (CAPTIONS[i].label) return Math.min(CAPTIONS[i].tout - 0.25, BOOK_OUT[0]);
    var last = 0;
    for (i = 0; i < REGIONS.length; i++) last = Math.max(last, REGIONS[i].t0 + SWEEP);
    return Math.min(last + 0.12, BOOK_OUT[0]);
  }
  function motionSpans(tEnd) {
    var M = [[COVER_OUT[0], Math.max(COVER_OUT[1], BOOK_IN[1])]], i;
    for (i = 0; i < TURNS.length; i++) M.push([TURNS[i].t0, TURNS[i].t1]);
    for (i = 0; i + 1 < CAMK.length; i++) if (CAMK[i][1] !== CAMK[i + 1][1]) M.push([CAMK[i][0], CAMK[i + 1][0]]);
    if (REGIONS.length) {
      var r0 = Infinity, r1 = 0;
      for (i = 0; i < REGIONS.length; i++) { r0 = Math.min(r0, REGIONS[i].t0); r1 = Math.max(r1, REGIONS[i].t0 + SWEEP); }
      M.push([r0, r1]);
    }
    M.sort(function (a, b) { return a[0] - b[0]; });
    var U = [];
    for (i = 0; i < M.length; i++) {
      var a = Math.max(0, M[i][0]), b = Math.min(tEnd, M[i][1]);
      if (b <= a) continue;
      if (U.length && a <= U[U.length - 1][1]) U[U.length - 1][1] = Math.max(U[U.length - 1][1], b);
      else U.push([a, b]);
    }
    return U;
  }
  function deriveWarp() {
    T_END = paletteEnd();
    var s = CFG.scroll || {};
    if (s.warp) { WARP = s.warp; return; }
    var U = motionSpans(T_END), knots = [[0, 0]], cur = 0, acc = 0, i;
    function step(t1, rate) { if (t1 <= cur) return; acc += (t1 - cur) * rate; cur = t1; knots.push([acc, t1]); }
    for (i = 0; i < U.length; i++) { step(U[i][0], IDLE); step(U[i][1], 1); }
    step(T_END, IDLE);
    for (i = 0; i < knots.length; i++) knots[i][0] = knots[i][0] / acc;
    knots[knots.length - 1][0] = 1;
    WARP = knots;
  }
  // scroll progress p (0..1) -> film seconds; never resets: p >= 1 (or past the track) holds T_END, p <= 0 or NaN gives 0
  function filmTime(p) {
    p = Number(p);
    if (!(p > 0)) return 0;
    if (p >= 1) return T_END;
    for (var i = 1; i < WARP.length; i++) {
      var p1 = WARP[i][0], t1 = WARP[i][1], p0 = WARP[i - 1][0], t0 = WARP[i - 1][1];
      if (p <= p1) return t0 + (t1 - t0) * ((p - p0) / (p1 - p0));
    }
    return T_END;
  }

  /* ------------------------------------------------------------------ palette preview masks */

  var maskCanvas = null, mctx = null;

  function rgba(hex, a) {
    var n = parseInt(hex.slice(1), 16);
    return 'rgba(' + (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + a + ')';
  }

  // Paints the progressive palette layer for time t into the offscreen mask canvas.
  var regionCanvas=null,regionCtx=null;
  // web copy (17/10, Richard: « le coloriage spontané des pages était très mal fait ») : each group is a shaded colour layer
  // made by tools/colourist.py (light from the upper left, pooled marker edges, highlights, the cap's cast shadow); it is
  // laid down by a 35-degree marker sweep across the group, not a flat radial blob. A group without a layer falls back to
  // the release behaviour (06/10): its mask clips a flat colour that spreads from the seed.
  function paintMasks(t) {
    if(!maskCanvas){maskCanvas=document.createElement('canvas');maskCanvas.width=MC_W;maskCanvas.height=MC_H;mctx=maskCanvas.getContext('2d');
      regionCanvas=document.createElement('canvas');regionCanvas.width=MC_W;regionCanvas.height=MC_H;regionCtx=regionCanvas.getContext('2d');}
    var c=mctx;c.setTransform(1,0,0,1,0,0);c.globalAlpha=1;c.globalCompositeOperation='source-over';c.clearRect(0,0,MC_W,MC_H);var any=false;
    var sx=MC_W/LAYER_W, sy=MC_H/LAYER_H;
    for(var i=0;i<REGIONS.length;i++){
      var r=REGIONS[i],layer=IMG['fc'+i],mask=IMG['mask'+i],p,rc;
      if(layer){
        p=seg(t,r.t0,r.t0+SWEEP);if(p<=0)continue;any=true;
        rc=regionCtx;rc.setTransform(1,0,0,1,0,0);rc.globalAlpha=1;rc.globalCompositeOperation='source-over';rc.clearRect(0,0,MC_W,MC_H);
        rc.drawImage(layer,0,0,MC_W,MC_H);
        if(p<1){
          var b=FBB?FBB[i]:[0,0,LAYER_W,LAYER_H],x0=b[0]*sx,y0=b[1]*sy,x1=b[2]*sx,y1=b[3]*sy;
          var dx=(x1-x0),dy=(y1-y0)*0.64;                       // sweep along ~35 degrees, upper left to lower right
          var g=rc.createLinearGradient(x0,y0,x0+dx,y0+dy),f=eio(p),soft=0.07;
          g.addColorStop(0,'rgba(0,0,0,1)');g.addColorStop(Math.max(0,Math.min(1,f)),'rgba(0,0,0,1)');
          g.addColorStop(Math.max(0,Math.min(1,f+soft)),'rgba(0,0,0,0)');g.addColorStop(1,'rgba(0,0,0,0)');
          rc.globalCompositeOperation='destination-in';rc.fillStyle=g;rc.fillRect(0,0,MC_W,MC_H);
        }
        c.drawImage(regionCanvas,0,0);
      } else if(mask){
        p=seg(t,r.t0,r.t0+REGION_DUR);if(p<=0)continue;any=true;
        rc=regionCtx;rc.setTransform(1,0,0,1,0,0);rc.globalAlpha=1;rc.globalCompositeOperation='source-over';rc.clearRect(0,0,MC_W,MC_H);
        rc.drawImage(mask,0,0,MC_W,MC_H);rc.globalCompositeOperation='source-in';
        var qx=r.seed[0]*MC_W/MASK_W,qy=r.seed[1]*MC_H/MASK_H,rad=Math.max(1,RREACH*MC_W/MASK_W*eout(p));
        var rg=rc.createRadialGradient(qx,qy,0,qx,qy,rad);rg.addColorStop(0,rgba(r.c,r.a));rg.addColorStop(.78,rgba(r.c,r.a));rg.addColorStop(1,rgba(r.c,0));
        rc.fillStyle=rg;rc.fillRect(0,0,MC_W,MC_H);c.globalAlpha=esine(p);c.drawImage(regionCanvas,0,0);c.globalAlpha=1;
      }
    }return any;
  }

  // Draw palette layer + native line image over the printed page rectangle (x, y, page width pw).
  function drawPalette(t, x, y, pw) {
    var ax = x + ART.x * pw, ay = y + ART.y * pw, aw = ART.w * pw, ah = ART.h * pw;
    var any = paintMasks(t);
    ctx.save();
    if (any) {
      ctx.filter = 'none';
      ctx.drawImage(maskCanvas, ax, ay, aw, ah);
      ctx.filter = 'none';
    }
    // Unchanged native line art above every color layer.
    ctx.globalCompositeOperation = 'multiply';
    ctx.drawImage(IMG.art, ax, ay, aw, ah);
    ctx.restore();
  }

  /* ------------------------------------------------------------------ drawing */

  var canvas = document.querySelector('canvas[data-montage]');
  var ctx = canvas.getContext('2d');
  var G = { s: 1 };

  // web copy: the background is the same for a given size, so it is painted once into a cache and blitted
  // (four full-canvas gradient fills per frame cost ~20 ms on desktop while scrolling, 17/10 measure)
  var bgCache = null, bgW = 0, bgH = 0;
  function drawBackground(W, H, alpha) {
    if (!bgCache || bgW !== W || bgH !== H) {
      bgCache = document.createElement('canvas'); bgCache.width = W; bgCache.height = H; bgW = W; bgH = H;
      var keep = ctx; ctx = bgCache.getContext('2d'); paintBackground(W, H, 1); ctx = keep;
    }
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = alpha;
    ctx.drawImage(bgCache, 0, 0);
    ctx.restore();
  }
  function paintBackground(W, H, alpha) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = COL.ivory;
    ctx.fillRect(0, 0, W, H);
    var m = Math.max(W, H);
    var g = ctx.createRadialGradient(W * 0.28, H * 0.16, 0, W * 0.28, H * 0.16, m * 0.9);
    g.addColorStop(0, 'rgba(253,250,244,0.95)');
    g.addColorStop(0.55, 'rgba(250,246,238,0.25)');
    g.addColorStop(1, 'rgba(250,246,238,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    var f = ctx.createLinearGradient(0, H * 0.55, 0, H);
    f.addColorStop(0, 'rgba(96,122,86,0)');
    f.addColorStop(1, 'rgba(96,122,86,0.07)');
    ctx.fillStyle = f;
    ctx.fillRect(0, 0, W, H);
    var v = ctx.createRadialGradient(W / 2, H * 0.5, Math.min(W, H) * 0.36, W / 2, H * 0.5, Math.hypot(W, H) * 0.62);
    v.addColorStop(0, 'rgba(118,96,60,0)');
    v.addColorStop(1, 'rgba(118,96,60,0.14)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  function softShadow(blur, oy, a) {
    ctx.shadowColor = 'rgba(52,44,26,' + a + ')';
    ctx.shadowBlur = blur * G.s;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = oy * G.s;
  }

  function drawCover(cx, cy, w, sc, rot, alpha) {
    var h = w * COVER_AR;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    ctx.scale(sc, sc);
    // Ambient then contact shadow, both cast by the opaque cover itself; the cover pixels are drawn untouched
    // (no overlay, band or tint). During a fade the second pass only speeds the opacity ramp.
    softShadow(70, 32, 0.30);
    ctx.drawImage(IMG.cover, -w / 2, -h / 2, w, h);
    softShadow(10, 4, 0.26);
    ctx.drawImage(IMG.cover, -w / 2, -h / 2, w, h);
    ctx.restore();
  }

  // Paper stack beneath a page; dir +1 = edges to the right (unturned block), -1 = to the left (turned pile).
  function drawSheetStack(x, y, w, h, dir, n) {
    var dx = 1.3, dy = 1.7;
    ctx.save();
    softShadow(38, 18, 0.20);
    ctx.fillStyle = COL.sheet;
    ctx.fillRect(x + dir * n * dx, y + n * dy, w, h);
    ctx.restore();
    ctx.save();
    ctx.lineWidth = 0.8;
    ctx.strokeStyle = 'rgba(150,132,100,0.28)';
    for (var i = n; i >= 1; i--) {
      ctx.fillStyle = (i % 2) ? COL.sheet : COL.sheetEdge;
      ctx.fillRect(x + dir * i * dx, y + i * dy, w, h);
      ctx.strokeRect(x + dir * i * dx, y + i * dy, w, h);
    }
    ctx.restore();
  }

  function drawGutter(hx, ty, pw, ph, dir, a) {
    var g = ctx.createLinearGradient(hx, 0, hx + dir * pw * 0.075, 0);
    g.addColorStop(0, 'rgba(70,58,36,' + a + ')');
    g.addColorStop(1, 'rgba(70,58,36,0)');
    ctx.fillStyle = g;
    if (dir > 0) ctx.fillRect(hx, ty, pw * 0.075, ph);
    else ctx.fillRect(hx - pw * 0.075, ty, pw * 0.075, ph);
  }

  // A printed sheet turning about the hinge. The sheet is a bending strip curve in x/z, projected with
  // perspective; each strip shows the front (recto drawing) or the actual blank reverse depending on facing.
  var STRIPS = 44, PERSP = 4.4;
  var LIGHT = [-0.33, 0.944];

  function drawTurn(front, back, theta, hx, ty, pw) {
    var ph = HR * pw, yc = HR / 2;
    var xs = [0], zs = [0], ph_ = [], i;
    var bend = 0.5 * Math.sin(theta);
    for (i = 0; i < STRIPS; i++) {
      var phi = theta + bend * ((i + 0.5) / STRIPS);
      ph_.push(phi);
      xs.push(xs[i] + Math.cos(phi) / STRIPS);
      zs.push(zs[i] + Math.sin(phi) / STRIPS);
    }
    var xe = xs[STRIPS], lift = Math.sin(theta);

    // cast shadow on whichever side the free edge hangs over
    ctx.save();
    var edge = hx + xe * pw, g, a = 0.26 * lift;
    if (xe > 0) {
      g = ctx.createLinearGradient(hx, 0, edge + pw * 0.14, 0);
      g.addColorStop(0, 'rgba(48,40,24,0.05)');
      g.addColorStop(clamp((edge - hx) / (edge + pw * 0.14 - hx), 0.01, 0.99), 'rgba(48,40,24,' + a + ')');
      g.addColorStop(1, 'rgba(48,40,24,0)');
      ctx.fillStyle = g;
      ctx.fillRect(hx, ty, edge + pw * 0.14 - hx, ph);
    } else if (xe < 0) {
      g = ctx.createLinearGradient(hx, 0, edge - pw * 0.14, 0);
      g.addColorStop(0, 'rgba(48,40,24,0.05)');
      g.addColorStop(clamp((hx - edge) / (hx - edge + pw * 0.14), 0.01, 0.99), 'rgba(48,40,24,' + a + ')');
      g.addColorStop(1, 'rgba(48,40,24,0)');
      ctx.fillStyle = g;
      ctx.fillRect(edge - pw * 0.14, ty, hx - edge + pw * 0.14, ph);
    }
    ctx.restore();

    var fi = IMG[front], bi = IMG[back];
    // web copy: strips are cut in each image's own pixels (pages are capped at 540 px high by D-006)
    var FW = fi.naturalWidth || PAGE_W, FH = fi.naturalHeight || PAGE_H;
    var BW = bi.naturalWidth || PAGE_W, BH = bi.naturalHeight || PAGE_H;
    for (i = 0; i < STRIPS; i++) {
      var pa = PERSP / (PERSP - zs[i]), pb = PERSP / (PERSP - zs[i + 1]);
      var Xa = hx + xs[i] * pa * pw, Xb = hx + xs[i + 1] * pb * pw;
      var pm = (pa + pb) / 2;
      var top = ty + (yc - yc * pm) * pw, hh = HR * pm * pw;
      var w = Math.abs(Xb - Xa);
      if (w < 0.05) continue;
      var dx = Math.min(Xa, Xb) - 0.4, dw = w + 0.8;
      var phi = ph_[i], nx = -Math.sin(phi), nz = Math.cos(phi), facing;
      if (Xb > Xa) {
        ctx.drawImage(fi, (i / STRIPS) * FW, 0, FW / STRIPS, FH, dx, top, dw, hh);
        facing = nx * LIGHT[0] + nz * LIGHT[1];
      } else {
        ctx.drawImage(bi, (1 - (i + 1) / STRIPS) * BW, 0, BW / STRIPS, BH, dx, top, dw, hh);
        facing = -(nx * LIGHT[0] + nz * LIGHT[1]);
      }
      var shade = clamp((0.944 - facing) * 0.6, 0, 0.5);
      if (shade > 0.003) {
        ctx.fillStyle = 'rgba(38,36,26,' + shade.toFixed(4) + ')';
        ctx.fillRect(dx, top, dw, hh);
      }
    }
  }

  function bookState(t) {
    var landed = 0, active = -1;
    for (var i = 0; i < TURNS.length; i++) {
      if (t >= TURNS[i].t1) landed = i + 1;
      else if (t >= TURNS[i].t0) { active = i; break; }
      else break;
    }
    var right = active >= 0 ? TURNS[active].next : (landed > 0 ? TURNS[landed - 1].next : TURNS[0].front);
    return { landed: landed, active: active, right: right, left: landed > 0 ? TURNS[landed - 1].back : null };
  }

  function drawBook(t, L, offX) {
    var cam = camAt(t, L);
    var hx = cam.hx + offX, ty = cam.ty, pw = cam.pw, ph = pw * HR;
    var st = bookState(t);

    drawSheetStack(hx, ty, pw, ph, 1, 4);
    ctx.drawImage(IMG[st.right], hx, ty, pw, ph);
    if (st.right === COLOURED && st.active < 0 && t >= COLOR_START) drawPalette(t, hx, ty, pw);

    if (st.left) {
      drawSheetStack(hx - pw, ty, pw, ph, -1, Math.min(st.landed + 1, 4));
      ctx.drawImage(IMG[st.left], hx - pw, ty, pw, ph);
      drawGutter(hx, ty, pw, ph, -1, 0.10);
    }
    drawGutter(hx, ty, pw, ph, 1, 0.12);

    if (st.active >= 0) {
      var T = TURNS[st.active];
      var theta = Math.PI * eio(seg(t, T.t0, T.t1));
      if (!st.left && theta > Math.PI * 0.6) {
        // footprint of the first sheet arriving on the empty left side
        ctx.save();
        ctx.globalAlpha = seg(theta, Math.PI * 0.6, Math.PI);
        drawSheetStack(hx - pw, ty, pw, ph, -1, 2);
        ctx.restore();
      }
      drawTurn(T.front, T.back, theta, hx, ty, pw);
    }
  }

  /* ------------------------------------------------------------------ typography */

  function tracked(text, x, y, track, align) {
    var chars = text.split(''), widths = [], total = 0, i;
    for (i = 0; i < chars.length; i++) { widths.push(ctx.measureText(chars[i]).width); total += widths[i]; }
    total += track * (chars.length - 1);
    var cx = align === 'center' ? x - total / 2 : x;
    ctx.textAlign = 'left';
    for (i = 0; i < chars.length; i++) { ctx.fillText(chars[i], cx, y); cx += widths[i] + track; }
    return total;
  }

  function wrap(text, maxW) {
    var words = text.split(' '), lines = [], line = '';
    for (var i = 0; i < words.length; i++) {
      var test = line ? line + ' ' + words[i] : words[i];
      if (line && ctx.measureText(test).width > maxW) { lines.push(line); line = words[i]; }
      else line = test;
    }
    if (line) lines.push(line);
    return lines;
  }

  function drawSwatches(t, x, y, align, r) {
    var n = REGIONS.length, gap = r * 3.1, total = gap * (n - 1);
    var x0 = align === 'center' ? x - total / 2 : x + r;
    for (var i = 0; i < n; i++) {
      var a = eout(seg(t, REGIONS[i].t0, REGIONS[i].t0 + 0.35));
      if (a <= 0) continue;
      ctx.save();
      ctx.globalAlpha *= a;
      ctx.beginPath();
      ctx.arc(x0 + i * gap, y + r, r * (0.6 + 0.4 * a), 0, Math.PI * 2);
      ctx.fillStyle = REGIONS[i].c;
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(47,70,54,0.25)';
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawCaption(t, L, cap) {
    var alpha = Math.min(eout(seg(t, cap.tin, cap.tin + 0.45)), 1 - esine(seg(t, cap.tout - 0.4, cap.tout)));
    if (alpha <= 0) return;
    var b = L[cap.box], rise = (1 - alpha) * 14;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.textBaseline = 'alphabetic';

    var ks = b.ks, size = b.size || 0, lines = [], lh = size * 1.12;
    if (cap.main) { ctx.font = '400 ' + size + 'px ' + SERIF; lines = wrap(cap.main, b.maxW); }
    var kh = (cap.kicker || cap.label) ? ks * 2.0 : 0;
    var subSize = Math.round(ks * 1.08), subH = cap.sub ? subSize * 2.1 : 0;
    var swH = cap.label ? ks * 1.6 : 0;
    var total = kh + lines.length * lh + subH + swH;
    var y = (b.anchor === 'middle' ? b.y - total / 2 : b.y) + rise;

    if (cap.kicker || cap.label) {
      ctx.font = '600 ' + ks + 'px ' + SANS;
      ctx.fillStyle = cap.label ? COL.forest : COL.amber;
      var txt = (cap.kicker || cap.label).toUpperCase();
      var tw = tracked(txt, b.x, y + ks * 0.95, ks * 0.24, b.align);
      // hairline rule beside / beneath the kicker
      ctx.fillStyle = 'rgba(168,116,47,0.55)';
      if (b.align === 'center') ctx.fillRect(b.x - 22, y + ks * 1.45, 44, 1.5);
      else ctx.fillRect(b.x, y + ks * 1.45, Math.min(56, tw), 1.5);
      y += kh;
    }
    if (lines.length) {
      ctx.font = '400 ' + size + 'px ' + SERIF;
      ctx.fillStyle = COL.forest;
      ctx.textAlign = b.align;
      for (var i = 0; i < lines.length; i++) ctx.fillText(lines[i], b.x, y + size * 0.86 + i * lh);
      y += lines.length * lh;
    }
    if (cap.sub) {
      ctx.font = '500 ' + subSize + 'px ' + SANS;
      ctx.fillStyle = COL.muted;
      ctx.textAlign = b.align;
      ctx.fillText(cap.sub, b.x, y + subSize * 1.55);
      y += subH;
    }
    if (cap.label) drawSwatches(t, b.x, y + ks * 0.1, b.align, ks * 0.42);
    ctx.restore();
  }

  /* ------------------------------------------------------------------ frame */

  function renderFrame(seconds, size) {
    var t = clamp(Number(seconds) || 0, 0, DURATION);
    var W = Math.max(1, Math.round((size && size.width) || 1080));
    var H = Math.max(1, Math.round((size && size.height) || 1920));
    if (canvas.width !== W) canvas.width = W;
    if (canvas.height !== H) canvas.height = H;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.filter = 'none';
    ctx.shadowColor = 'rgba(0,0,0,0)';
    ctx.shadowBlur = 0;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'medium';   // web copy: sources are capped at 540 px; 'high' cost time, not detail

    var P = pickLayout(W, H), L = P.L;
    G.s = P.s;
    drawBackground(W, H, 1);
    if (!LOADED) return canvas;   // callers must await window.ready
    ctx.setTransform(P.s, 0, 0, P.s, P.ox, P.oy);

    // Book: sampler pages, page turns, palette preview
    if (t >= BOOK_IN[0] && t < BOOK_OUT[1]) {
      var offX = L.enterX * (1 - eout(seg(t, BOOK_IN[0], BOOK_IN[1])));
      drawBook(t, L, offX);
      var fade = esine(seg(t, BOOK_OUT[0], BOOK_OUT[1]));
      if (fade > 0) {
        drawBackground(W, H, fade);
        ctx.setTransform(P.s, 0, 0, P.s, P.ox, P.oy);
      }
    }

    // Opening cover: present from frame 0, slow push, then dealt aside as the pages arrive
    if (t < COVER_OUT[1]) {
      var push = eio(seg(t, 0, COVER_OUT[0]));
      var out = eio(seg(t, COVER_OUT[0], COVER_OUT[1]));
      drawCover(L.cover.cx - L.exitX * out, L.cover.cy - 10 * push + 30 * out,
        L.cover.w, 1 + 0.03 * push - 0.04 * out, -0.055 * out, 1);
    }

    // Closing cover and promise
    if (t >= COVER_IN[0]) {
      var e = eout(seg(t, COVER_IN[0], COVER_IN[1]));
      var settle = eio(seg(t, COVER_IN[1], DURATION));
      drawCover(L.cover.cx, L.cover.cy + 40 * (1 - e), L.cover.w, 0.95 + 0.05 * e + 0.02 * settle, 0, e);
    }

    for (var i = 0; i < CAPTIONS.length; i++) drawCaption(t, L, CAPTIONS[i]);
    return canvas;
  }

  /* ------------------------------------------------------------------ loading */

  function loadImage(key, url, optional) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () {
        IMG[key] = img;
        if (img.decode) img.decode().then(function () { resolve(img); }, function () { resolve(img); });
        else resolve(img);
      };
      img.onerror = function () {
        if (optional) { delete IMG[key]; resolve(null); }
        else reject(new Error('Could not load ' + url));
      };
      img.src = url;
    });
  }

  function readConfig() {
    if (window.BOOK_FILM && window.BOOK_FILM.turns) return Promise.resolve(window.BOOK_FILM);
    var slug = (window.BOOK_FILM && window.BOOK_FILM.slug) || canvas.getAttribute('data-book') || 'shops';
    return fetch('/js/books/' + slug + '.json').then(function (r) {
      if (!r.ok) throw new Error('montage: no config for ' + slug);
      return r.json();
    });
  }

  // colour layers: the page may hand them over (window.FILM_COLOUR, as on 17/10) or the engine reads them itself
  function readColourLayers() {
    var col = CFG.colour;
    if (!col) return Promise.resolve(null);
    if (window.FILM_COLOUR && window.FILM_COLOUR.bbox) return Promise.resolve(window.FILM_COLOUR);
    return fetch(CFG.media.base + col.json).then(function (r) { return r.ok ? r.json() : null; }, function () { return null; })
      .then(function (j) { if (j && j.bbox) { window.FILM_COLOUR = j; return j; } return null; }, function () { return null; });
  }

  // Group masks for the release fallback, rebuilt from the served region map of the film's line art (ids R + 256 G;
  // json regions carry film_order = the film mask covering >= 50 % of the region, tools/prepare_book_pages.py). A pixel
  // of group k is opaque in mask k, everything else transparent: the same clip the release masks gave, at the served size.
  function masksFromRegionMap(img, map, need) {
    var w = img.naturalWidth, h = img.naturalHeight, i;
    var cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    var cx = cv.getContext('2d', { willReadFrequently: true });
    cx.drawImage(img, 0, 0);
    var d = cx.getImageData(0, 0, w, h).data;
    var group = new Int16Array(65536); group.fill(-1);
    for (i = 0; i < map.regions.length; i++) {
      var r = map.regions[i];
      if (r.film_order != null && !r.edge) group[r.id] = r.film_order;
    }
    var outs = {};
    need.forEach(function (k) { outs[k] = cx.createImageData(w, h); });
    for (var p = 0; p < d.length; p += 4) {
      var g = group[d[p] + 256 * d[p + 1]];
      if (g >= 0 && outs[g]) outs[g].data[p + 3] = 255;
    }
    need.forEach(function (k) {
      var m = document.createElement('canvas'); m.width = w; m.height = h;
      m.getContext('2d').putImageData(outs[k], 0, 0);
      m.naturalWidth = w; m.naturalHeight = h;
      IMG['mask' + k] = m;
    });
  }

  function missing() {
    var out = [];
    for (var i = 0; i < REGIONS.length; i++) if (!IMG['fc' + i] && !IMG['mask' + i]) out.push(i);
    return out;
  }

  var LOADED = false;
  window.ready = readConfig()
    .then(function (cfg) { configure(cfg); return readColourLayers(); })
    .then(function (film) {
      var jobs = [loadImage('cover', SRC.cover, false), loadImage('art', SRC.art, false)];
      Object.keys(CFG.media.pages).forEach(function (k) { jobs.push(loadImage(k, SRC[k], false)); });
      var n = REGIONS.length, i;
      if (film) {
        var prefix = film.prefix || (CFG.media.base + CFG.colour.prefix);
        for (i = 0; i < n && i < (film.layers || n); i++) jobs.push(loadImage('fc' + i, prefix + i + '.png', true));
      }
      return Promise.all(jobs).then(function () { return film; });
    })
    .then(function (film) {
      // fallback 1: the film's own mask files, only for groups without a colour layer
      var need = missing(), base = CFG.media.base;
      if (!need.length || !CFG.media.masks) return film;
      return Promise.all(need.map(function (k) { return loadImage('mask' + k, base + CFG.media.masks + k + '.png', true); }))
        .then(function () { return film; });
    })
    .then(function (film) {
      // fallback 2: masks rebuilt from the served region map
      var need = missing(), base = CFG.media.base, name = CFG.media.film_regions;
      if (!need.length || !name) return film;
      return Promise.all([
        loadImage('regionMap', base + name + '.png', true),
        fetch(base + name + '.json').then(function (r) { return r.ok ? r.json() : null; }, function () { return null; })
      ]).then(function (got) {
        if (got[0] && got[1] && got[1].regions) masksFromRegionMap(got[0], got[1], need);
        delete IMG.regionMap;
        return film;
      }, function () { return film; });
    })
    .then(function (film) {
      // D-006 (Richard, 17/10): no page image above the cap; a bigger file keeps the page on its floor
      var cap = CFG.max_image_h || 540, keys = ['art'].concat(Object.keys(CFG.media.pages)), i;
      for (i = 0; i < REGIONS.length; i++) { keys.push('fc' + i); keys.push('mask' + i); }
      keys.forEach(function (k) {
        if (IMG[k] && IMG[k].naturalHeight > cap) throw new Error('montage: ' + k + ' is ' + IMG[k].naturalHeight + ' px high (D-006 cap ' + cap + ')');
      });
      FBB = film ? film.bbox : null;
      LAYER_W = (IMG.fc0 && IMG.fc0.naturalWidth) || (film && film.w) || 417;
      LAYER_H = (IMG.fc0 && IMG.fc0.naturalHeight) || (film && film.h) || 540;
      var modes = [];
      for (i = 0; i < REGIONS.length; i++) modes.push(IMG['fc' + i] ? 'layer' : (IMG['mask' + i] ? 'mask' : 'none'));
      COLOUR_MODE = modes.every(function (m) { return m === 'layer'; }) ? 'layers'
        : (modes.every(function (m) { return m === 'mask'; }) ? 'masks' : (modes.every(function (m) { return m === 'none'; }) ? 'none' : 'mixed'));
      if (COLOUR_MODE !== 'layers') console.warn('montage: palette preview on ' + COLOUR_MODE + ' (' + modes.join(',') + ')');
      var M = window.MONTAGE;
      M.duration = DURATION; M.slug = CFG.slug; M.config = CFG; M.colourMode = COLOUR_MODE; M.regionModes = modes;
      M.warp = WARP; M.tEnd = T_END; M.motion = motionSpans(T_END);
      M.source = function (kind, k) { return IMG[kind + k] || null; };   // inspection only (proofs/montage-engine)
      return (document.fonts && document.fonts.ready) ? document.fonts.ready : null;
    })
    .then(function () {
      LOADED = true;
      renderFrame(0, { width: canvas.width, height: canvas.height });
      return true;
    });

  window.renderFrame = renderFrame;
  window.MONTAGE = { duration: DURATION, sizes: [[1080, 1920], [1080, 1080], [1920, 1080]], filmTime: filmTime };

  /* ------------------------------------------------------------------ optional preview (?preview) */
  // Interactive scrubbing only; it calls the same pure renderFrame and never feeds state back into it.
  var ratio = document.getElementById('ratio'), scrub = document.getElementById('scrub');
  if (/[?&]preview\b/.test(location.search) && ratio && scrub) {
    document.body.classList.add('preview');
    var clock = document.getElementById('clock'), play = document.getElementById('play');
    var playing = false, startAt = 0, startT = 0;
    var dims = function () { var p = ratio.value.split('x'); return { width: +p[0], height: +p[1] }; };
    var show = function (tt) { renderFrame(tt, dims()); scrub.value = tt; clock.textContent = tt.toFixed(2) + ' s'; };
    window.ready.then(function () {
      show(0);
      scrub.addEventListener('input', function () { playing = false; play.textContent = 'Play'; show(+scrub.value); });
      ratio.addEventListener('change', function () { show(+scrub.value); });
      play.addEventListener('click', function () {
        playing = !playing;
        play.textContent = playing ? 'Pause' : 'Play';
        if (playing) {
          startAt = performance.now();
          startT = +scrub.value >= DURATION ? 0 : +scrub.value;
          requestAnimationFrame(function tick(now) {
            if (!playing) return;
            var tt = startT + (now - startAt) / 1000;
            if (tt >= DURATION) { tt = DURATION; playing = false; play.textContent = 'Play'; }
            show(tt);
            if (playing) requestAnimationFrame(tick);
          });
        }
      });
    });
  }
})();
