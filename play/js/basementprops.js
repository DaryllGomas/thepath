// The basement's 1982 clutter (look batch 3c): a workshop corner, a laundry corner, a utility wall, storage, a record corner, rugs and
// posters, all built in code (three.js boxes and lathes, procedural canvas textures on ONE atlas) so the rec room stops being a big empty
// carpet. Nothing here is a downloaded asset and every name on a poster, a can or a nameplate is invented.
//
// The cost: five draw calls (the lit atlas mesh, the metal one, the cloth on the line, the glowing bulbs, the contact shadows), about
// ten thousand triangles, one 2048 atlas, four small point lights (no shadows). The pieces are lit like the room: the baked bounce at their
// spot (world.js samples the floor's own lightmap; `bounceAt`) goes in as the ambient term, the room's real lights (the lamp, the cabinets)
// light them directly, and every piece sits on a soft contact shadow.
//
// buildBasementProps({ anisotropy, bounceAt }) -> { group, colliders, lights, metals, stats }
import * as THREE from 'three';

const PI = Math.PI;
const rng = (seed) => { let s = (seed >>> 0) || 1; return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296; };
const col = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };            // a hex colour as the linear values the shader multiplies
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const FONT_HAND = '"Marker Felt","Segoe Print","Comic Sans MS","Chalkboard SE","Bradley Hand",cursive,sans-serif';
const FONT_BLK = 'Impact,"Arial Black","Haettenschweiler","Liberation Sans",sans-serif';
const FONT_SANS = '"Helvetica Neue",Arial,"Liberation Sans",sans-serif';
const FONT_MONO = '"Courier New","Liberation Mono",monospace';

// ====================================================================================================== the atlas
class Atlas {
  constructor(size) {
    this.size = size; this.cv = document.createElement('canvas'); this.cv.width = this.cv.height = size;
    this.ctx = this.cv.getContext('2d'); this.x = 0; this.y = 0; this.rowH = 0; this.pad = 4;
    this.ctx.fillStyle = '#ffffff'; this.ctx.fillRect(0, 0, size, size);
  }
  tile(w, h, draw) {
    const P = this.pad, S = this.size, c = this.ctx;
    if (this.x + w + 2 * P > S) { this.x = 0; this.y += this.rowH; this.rowH = 0; }
    const ox = this.x + P, oy = this.y + P;
    if (oy + h + P > S) throw new Error('basement props atlas is full');
    this.x += w + 2 * P; this.rowH = Math.max(this.rowH, h + 2 * P);
    FIT = w * 0.9; c.save(); c.beginPath(); c.rect(ox, oy, w, h); c.clip(); c.translate(ox, oy); draw(c, w, h); c.restore(); FIT = 0;
    // the border pixels run outward a little, so a mip level or a filter tap never picks up the neighbour tile
    c.drawImage(this.cv, ox, oy, 1, h, ox - P, oy, P, h);
    c.drawImage(this.cv, ox + w - 1, oy, 1, h, ox + w, oy, P, h);
    c.drawImage(this.cv, ox - P, oy, w + 2 * P, 1, ox - P, oy - P, w + 2 * P, P);
    c.drawImage(this.cv, ox - P, oy + h - 1, w + 2 * P, 1, ox - P, oy + h, w + 2 * P, P);
    const e = 0.5 / S;
    return { u0: ox / S + e, v0: oy / S + e, u1: (ox + w) / S - e, v1: (oy + h) / S - e };
  }
}

// ---- small painting helpers
function grain(c, w, h, r, n, a0, dark = '40,25,10', light = '255,240,210', len = 14) {
  for (let i = 0; i < n; i++) {
    const d = r() < 0.55;
    c.fillStyle = `rgba(${d ? dark : light},${(a0 * (0.4 + r() * 0.8)).toFixed(3)})`;
    c.fillRect(r() * w, r() * h, 1 + r() * len, 1 + r() * 2);
  }
}
function woodGrain(c, w, h, r, base, dark, vertical = false) {
  c.fillStyle = base; c.fillRect(0, 0, w, h);
  const N = Math.round((vertical ? w : h) / 3);
  for (let i = 0; i < N; i++) {
    const p = r() * (vertical ? w : h);
    c.strokeStyle = `rgba(${dark},${(0.06 + r() * 0.16).toFixed(3)})`; c.lineWidth = 0.6 + r() * 1.6; c.beginPath();
    if (vertical) { c.moveTo(p, 0); c.bezierCurveTo(p + (r() - 0.5) * 14, h * 0.33, p + (r() - 0.5) * 14, h * 0.66, p + (r() - 0.5) * 6, h); }
    else { c.moveTo(0, p); c.bezierCurveTo(w * 0.33, p + (r() - 0.5) * 8, w * 0.66, p + (r() - 0.5) * 8, w, p + (r() - 0.5) * 4); }
    c.stroke();
  }
}
function hand(c, text, cx, cy, size, color, r, font = FONT_HAND) {
  // marker lettering: every letter a hair off the line and the angle
  c.font = `bold ${size}px ${font}`; c.fillStyle = color; c.textAlign = 'left'; c.textBaseline = 'middle';
  const ws = [...text].map((ch) => c.measureText(ch).width + size * 0.04); const tw = ws.reduce((a, b) => a + b, 0);
  let x = cx - tw / 2;
  [...text].forEach((ch, i) => { c.save(); c.translate(x, cy + (r() - 0.5) * size * 0.12); c.rotate((r() - 0.5) * 0.11); c.fillText(ch, 0, 0); c.restore(); x += ws[i]; });
}
let FIT = 0;                                       // while a tile is painted: the widest a line of lettering may be (the tile's width less a margin)
function centred(c, text, x, y, font, color, stroke) {
  c.font = font; c.textAlign = 'center'; c.textBaseline = 'middle';
  if (FIT) { const w = c.measureText(text).width; if (w > FIT) { const m = /(\d+(?:\.\d+)?)px/.exec(font); if (m) { c.font = font.replace(m[0], (m[1] * FIT / w).toFixed(1) + 'px'); } } }
  if (stroke) { c.lineWidth = stroke[1]; c.strokeStyle = stroke[0]; c.lineJoin = 'round'; c.strokeText(text, x, y); }
  c.fillStyle = color; c.fillText(text, x, y);
}
function rrect(c, x, y, w, h, rad) {
  c.beginPath(); c.moveTo(x + rad, y); c.arcTo(x + w, y, x + w, y + h, rad); c.arcTo(x + w, y + h, x, y + h, rad); c.arcTo(x, y + h, x, y, rad); c.arcTo(x, y, x + w, y, rad); c.closePath();
}
function dial(c, x, y, rad, face = '#2b2b2b', mark = '#e8e0cc') {
  c.fillStyle = '#b9b6ad'; c.beginPath(); c.arc(x, y, rad, 0, PI * 2); c.fill();
  c.fillStyle = face; c.beginPath(); c.arc(x, y, rad * 0.78, 0, PI * 2); c.fill();
  c.strokeStyle = mark; c.lineWidth = Math.max(1, rad * 0.14); c.beginPath(); c.moveTo(x, y); c.lineTo(x + rad * 0.5, y - rad * 0.4); c.stroke();
}
function vignette(c, w, h, a) {
  const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, `rgba(0,0,0,${a * 0.5})`); g.addColorStop(0.18, 'rgba(0,0,0,0)'); g.addColorStop(0.8, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${a})`);
  c.fillStyle = g; c.fillRect(0, 0, w, h);
}

// ---- every tile of the atlas
function paintAtlas(A, r) {
  const T = {};
  T.white = A.tile(16, 16, (c, w, h) => { c.fillStyle = '#fff'; c.fillRect(0, 0, w, h); });
  T.flat = A.tile(32, 32, (c, w, h) => { c.fillStyle = '#e6e6e6'; c.fillRect(0, 0, w, h); grain(c, w, h, r, 60, 0.05, '0,0,0', '255,255,255', 4); });
  // ---- cardboard: plain sides, taped tops, and the hand-written labels
  const card = (c, w, h, label, size, lines2) => {
    const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#bb9362'); g.addColorStop(1, '#a37a4a'); c.fillStyle = g; c.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 3) { c.fillStyle = `rgba(80,50,20,${0.04 + r() * 0.05})`; c.fillRect(x, 0, 1, h); }
    grain(c, w, h, r, 140, 0.09, '70,40,15', '235,200,150', 22);
    c.fillStyle = 'rgba(60,35,12,0.18)'; c.fillRect(0, h - 4, w, 4); c.fillRect(0, 0, w, 2);
    if (label) {
      c.fillStyle = 'rgba(232,222,196,0.55)'; c.fillRect(w * 0.1, h * 0.22, w * 0.8, h * 0.56);
      const ls = label.split('\n'), col1 = r() < 0.5 ? '#1c2233' : '#7a1717';
      ls.forEach((t, i) => hand(c, t, w / 2, h * (ls.length > 1 ? 0.38 + i * 0.26 : 0.5), size, col1, r));
      if (lines2) { c.strokeStyle = col1; c.lineWidth = 2; c.beginPath(); c.moveTo(w * 0.15, h * 0.88); c.lineTo(w * 0.85, h * 0.885); c.stroke(); }
    }
    c.fillStyle = 'rgba(200,170,115,0.8)'; c.fillRect(w * 0.46, 0, w * 0.08, h * 0.2);
  };
  T.card = A.tile(96, 96, (c, w, h) => card(c, w, h, null));
  T.cardTop = A.tile(96, 96, (c, w, h) => { card(c, w, h, null); c.fillStyle = 'rgba(214,184,128,0.85)'; c.fillRect(0, h * 0.43, w, h * 0.14); c.fillStyle = 'rgba(0,0,0,0.12)'; c.fillRect(0, h * 0.43, w, 1); });
  const LB = [['XMAS\nLIGHTS', 26], ['KITCHEN\nSTUFF', 24], ['BOOKS\n(MOM\'S)', 26], ['TAXES\n79 - 81', 26], ['WINTER\nCOATS', 26], ['FRAGILE\nDISHES', 24], ['FAMILY\nALBUMS', 24], ['SUMMER\nCLOTHES', 22]];
  T.label = LB.map(([t, s]) => A.tile(128, 96, (c, w, h) => card(c, w, h, t, s, true)));
  T.tree = A.tile(72, 200, (c, w, h) => {
    c.fillStyle = '#e8e2d0'; c.fillRect(0, 0, w, h); c.fillStyle = '#2f6b3a'; c.beginPath(); c.moveTo(w / 2, 10); c.lineTo(w - 8, h * 0.45); c.lineTo(8, h * 0.45); c.fill();
    c.beginPath(); c.moveTo(w / 2, h * 0.25); c.lineTo(w - 4, h * 0.62); c.lineTo(4, h * 0.62); c.fill(); c.fillStyle = '#7b2a22'; c.fillRect(w / 2 - 4, h * 0.62, 8, 14);
    c.fillStyle = '#c8262d'; c.fillRect(0, h * 0.78, w, h * 0.12); centred(c, '6 FT', w / 2, h * 0.84, `bold 15px ${FONT_BLK}`, '#fff');
    centred(c, 'PINE TREE', w / 2, h * 0.93, `bold 11px ${FONT_SANS}`, '#222'); grain(c, w, h, r, 40, 0.1);
  });

  // ---- wood
  T.wood = A.tile(128, 128, (c, w, h) => { woodGrain(c, w, h, r, '#8a5a34', '40,20,8'); grain(c, w, h, r, 60, 0.06); });
  T.woodDark = A.tile(128, 128, (c, w, h) => { woodGrain(c, w, h, r, '#4d2d18', '20,8,2', true); });
  T.benchTop = A.tile(384, 80, (c, w, h) => {
    woodGrain(c, w, h, r, '#9a7446', '60,35,10');
    c.fillStyle = 'rgba(30,20,10,0.2)'; for (let i = 0; i < 26; i++) { c.beginPath(); c.arc(r() * w, r() * h, 1 + r() * 7, 0, PI * 2); c.fill(); }          // scorch, glue, oil
    c.fillStyle = 'rgba(190,35,30,0.55)'; c.fillRect(w * 0.64, h * 0.3, 20, 14); c.fillStyle = 'rgba(30,60,120,0.45)'; c.fillRect(w * 0.2, h * 0.55, 12, 16);
    c.strokeStyle = 'rgba(0,0,0,0.25)'; c.lineWidth = 1; for (let i = 0; i < 6; i++) { c.beginPath(); c.moveTo(r() * w, r() * h); c.lineTo(r() * w, r() * h); c.stroke(); }
  });
  T.plywood = A.tile(128, 96, (c, w, h) => { woodGrain(c, w, h, r, '#c0a275', '90,60,25'); grain(c, w, h, r, 40, 0.08); });

  // ---- the pegboard: hardboard, a hole every inch, and the tools hung on it
  T.pegboard = A.tile(768, 248, (c, w, h) => {
    c.fillStyle = '#a58660'; c.fillRect(0, 0, w, h); grain(c, w, h, r, 700, 0.12, '60,40,15', '220,190,140', 5);
    for (let y = 10; y < h; y += 14) for (let x = 8; x < w; x += 14) { c.fillStyle = 'rgba(25,15,6,0.75)'; c.beginPath(); c.arc(x, y, 1.8, 0, PI * 2); c.fill(); }
    const shadow = (fn) => { c.save(); c.translate(5, 6); c.globalAlpha = 0.32; fn('#000'); c.restore(); c.save(); fn(); c.restore(); };
    const red = '#b5342a', steel = '#aeb4b8', dsteel = '#7d858b', yel = '#d3b23c', blk = '#26282b', blu = '#2f5f9a';
    const hammer = (x, y, s) => shadow((k) => { c.fillStyle = k || '#8a5a30'; c.fillRect(x, y, 9 * s, 78 * s); c.fillStyle = k || dsteel; c.fillRect(x - 15 * s, y - 6 * s, 40 * s, 14 * s); c.beginPath(); c.moveTo(x - 15 * s, y - 6 * s); c.quadraticCurveTo(x - 32 * s, y - 18 * s, x - 28 * s, y - 28 * s); c.lineTo(x - 15 * s, y + 8 * s); c.fill(); });
    const wrench = (x, y, len, s) => shadow((k) => { c.fillStyle = k || steel; c.fillRect(x, y, 9 * s, len); c.beginPath(); c.arc(x + 4.5 * s, y, 13 * s, 0, PI * 2); c.fill(); c.beginPath(); c.arc(x + 4.5 * s, y + len, 11 * s, 0, PI * 2); c.fill(); if (!k) { c.fillStyle = '#a58660'; c.fillRect(x + 1 * s, y - 14 * s, 7 * s, 12 * s); c.fillRect(x + 1.5 * s, y + len + 2 * s, 6 * s, 11 * s); } });
    const driver = (x, y, len, hc) => shadow((k) => { c.fillStyle = k || steel; c.fillRect(x + 3, y + 26, 3, len); c.fillStyle = k || hc; rrect(c, x - 2, y, 13, 32, 5); c.fill(); });
    const pliers = (x, y, s) => shadow((k) => { c.fillStyle = k || red; c.fillRect(x, y + 28 * s, 6 * s, 42 * s); c.fillRect(x + 12 * s, y + 28 * s, 6 * s, 42 * s); c.fillStyle = k || dsteel; c.beginPath(); c.moveTo(x - 2 * s, y + 30 * s); c.lineTo(x + 20 * s, y + 30 * s); c.lineTo(x + 16 * s, y); c.lineTo(x + 2 * s, y); c.fill(); });
    const saw = (x, y) => shadow((k) => { c.fillStyle = k || '#bdc2c6'; c.beginPath(); c.moveTo(x, y); c.lineTo(x + 190, y + 4); c.lineTo(x + 190, y + 40); c.lineTo(x, y + 50); c.fill(); c.fillStyle = k || '#7a4a24'; rrect(c, x - 40, y - 6, 46, 62, 10); c.fill(); if (!k) { c.fillStyle = '#a58660'; c.beginPath(); c.arc(x - 18, y + 24, 8, 0, PI * 2); c.fill(); } });
    const tape = (x, y) => shadow((k) => { c.fillStyle = k || yel; c.beginPath(); c.arc(x, y, 24, 0, PI * 2); c.fill(); if (!k) { c.fillStyle = blk; c.beginPath(); c.arc(x, y, 6, 0, PI * 2); c.fill(); c.fillStyle = '#e8d070'; c.fillRect(x + 14, y + 10, 10, 6); } });
    const level = (x, y) => shadow((k) => { c.fillStyle = k || '#9bb23b'; c.fillRect(x, y, 240, 20); if (!k) { c.fillStyle = '#e8f0b0'; c.fillRect(x + 100, y + 5, 40, 10); c.fillStyle = blk; c.fillRect(x + 118, y + 5, 2, 10); } });
    const drill = (x, y) => shadow((k) => { c.fillStyle = k || blu; rrect(c, x, y, 78, 36, 8); c.fill(); c.fillRect(x + 20, y + 30, 22, 52); c.fillStyle = k || blk; c.fillRect(x + 78, y + 10, 30, 14); c.fillStyle = k || steel; c.fillRect(x + 108, y + 14, 36, 6); });
    hammer(54, 48, 1.1); wrench(120, 54, 120, 1); wrench(144, 60, 96, 0.85); wrench(164, 66, 72, 0.72); pliers(196, 60, 1.1); pliers(236, 56, 0.9);
    driver(268, 52, 74, red); driver(286, 52, 60, yel); driver(304, 52, 84, blu); saw(380, 28); level(364, 120); tape(640, 52); drill(560, 100); hammer(704, 58, 0.9);
    // a row of cup hooks with a coiled extension cord and a roll of tape
    c.strokeStyle = '#d96b1c'; c.lineWidth = 7; for (let i = 0; i < 4; i++) { c.beginPath(); c.ellipse(120, 190, 38 - i * 2, 22 - i, 0, 0, PI * 2); c.stroke(); }
    c.fillStyle = '#d9d4c4'; c.beginPath(); c.arc(520, 200, 18, 0, PI * 2); c.fill(); c.fillStyle = '#a58660'; c.beginPath(); c.arc(520, 200, 8, 0, PI * 2); c.fill();
    // the painted outlines where a tool is missing
    c.strokeStyle = 'rgba(30,20,8,0.55)'; c.lineWidth = 2; c.setLineDash([6, 4]); c.strokeRect(640, 150, 90, 60); c.setLineDash([]);
    vignette(c, w, h, 0.18);
  });

  // ---- the metals
  T.steel = A.tile(64, 64, (c, w, h) => { c.fillStyle = '#7f8f9c'; c.fillRect(0, 0, w, h); grain(c, w, h, r, 80, 0.12, '20,30,40', '230,240,250', 8); });
  T.shelfTop = A.tile(128, 64, (c, w, h) => { c.fillStyle = '#6d7b87'; c.fillRect(0, 0, w, h); for (let x = 4; x < w; x += 8) { c.fillStyle = 'rgba(0,0,0,0.12)'; c.fillRect(x, 0, 1, h); } grain(c, w, h, r, 80, 0.1, '20,30,40', '230,240,250', 6); c.fillStyle = 'rgba(150,70,20,0.2)'; for (let i = 0; i < 12; i++) c.fillRect(r() * w, r() * h, 5 + r() * 12, 2 + r() * 4); });
  T.galv = A.tile(128, 128, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, w, 0); g.addColorStop(0, '#838b90'); g.addColorStop(0.5, '#9ea4a8'); g.addColorStop(1, '#7b8388'); c.fillStyle = g; c.fillRect(0, 0, w, h);
    grain(c, w, h, r, 160, 0.14, '60,70,80', '255,255,255', 18); c.fillStyle = 'rgba(0,0,0,0.12)'; c.fillRect(w * 0.5, 0, 2, h); c.fillRect(0, h * 0.5, w, 2);
  });
  T.iron = A.tile(32, 32, (c, w, h) => { c.fillStyle = '#3d4a58'; c.fillRect(0, 0, w, h); grain(c, w, h, r, 40, 0.15, '0,0,0', '160,175,190', 4); });
  T.copper = A.tile(16, 16, (c, w, h) => { c.fillStyle = '#c9783f'; c.fillRect(0, 0, w, h); c.fillStyle = 'rgba(255,220,170,0.4)'; c.fillRect(0, 3, w, 3); });
  T.redTool = A.tile(64, 48, (c, w, h) => { c.fillStyle = '#a82b24'; c.fillRect(0, 0, w, h); grain(c, w, h, r, 40, 0.18, '60,0,0', '240,150,140', 5); c.fillStyle = '#dcd6c5'; c.fillRect(w * 0.1, h * 0.35, w * 0.8, h * 0.18); });

  // ---- laundry
  T.enamel = A.tile(16, 16, (c, w, h) => { c.fillStyle = '#e8e4d8'; c.fillRect(0, 0, w, h); });
  T.washerFront = A.tile(176, 208, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, w, 0); g.addColorStop(0, '#dcd8cc'); g.addColorStop(0.5, '#ece8dc'); g.addColorStop(1, '#d8d4c8'); c.fillStyle = g; c.fillRect(0, 0, w, h);
    c.fillStyle = '#9c978a'; c.fillRect(8, 8, w - 16, 3); c.fillStyle = 'rgba(0,0,0,0.1)'; c.fillRect(0, h - 22, w, 22);
    c.fillStyle = '#c9c4b6'; rrect(c, w * 0.34, h * 0.42, w * 0.32, h * 0.18, 6); c.fill();   // a recessed pull
    c.fillStyle = 'rgba(0,0,0,0.12)'; c.fillRect(w * 0.1, h * 0.8, w * 0.8, 2);
    grain(c, w, h, r, 90, 0.06, '90,70,40', '255,255,255', 10); c.fillStyle = 'rgba(120,95,50,0.18)'; c.fillRect(w * 0.7, h * 0.5, 3, h * 0.3);    // a rust run
    vignette(c, w, h, 0.18);
  });
  T.washerTop = A.tile(96, 96, (c, w, h) => {
    c.fillStyle = '#e6e2d6'; c.fillRect(0, 0, w, h); c.strokeStyle = '#a9a496'; c.lineWidth = 2; rrect(c, 8, 12, w - 16, h - 24, 6); c.stroke(); c.fillStyle = '#f0ede4'; rrect(c, 8, 12, w - 16, h - 24, 6); c.fill();
    c.fillStyle = '#9d9788'; c.fillRect(w * 0.4, h - 22, w * 0.2, 5); grain(c, w, h, r, 50, 0.05, '90,70,40', '255,255,255', 8);
  });
  T.washerPanel = A.tile(176, 40, (c, w, h) => {
    c.fillStyle = '#d6d2c4'; c.fillRect(0, 0, w, h); c.fillStyle = '#3a3a3c'; c.fillRect(4, 5, w - 8, h - 10);
    dial(c, w * 0.2, h / 2, 11); dial(c, w * 0.5, h / 2, 11); dial(c, w * 0.8, h / 2, 11);
    c.font = `bold 7px ${FONT_SANS}`; c.fillStyle = '#e6dcc0'; c.textAlign = 'center'; c.fillText('SUDSMASTER', w / 2, 10);
  });
  T.dryerFront = A.tile(176, 240, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, w, 0); g.addColorStop(0, '#dcd8cc'); g.addColorStop(0.5, '#eceadf'); g.addColorStop(1, '#d6d2c6'); c.fillStyle = g; c.fillRect(0, 0, w, h);
    c.fillStyle = '#c9c4b6'; c.fillRect(0, 0, w, 6);
    const cx = w / 2, cy = h * 0.52;
    c.fillStyle = '#a8a99f'; c.beginPath(); c.arc(cx, cy, 66, 0, PI * 2); c.fill(); c.fillStyle = '#cfd1c8'; c.beginPath(); c.arc(cx, cy, 58, 0, PI * 2); c.fill();
    const gg = c.createRadialGradient(cx - 18, cy - 20, 4, cx, cy, 46); gg.addColorStop(0, '#5a6366'); gg.addColorStop(1, '#14181a'); c.fillStyle = gg; c.beginPath(); c.arc(cx, cy, 46, 0, PI * 2); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.25)'; c.beginPath(); c.ellipse(cx - 16, cy - 20, 14, 8, -0.6, 0, PI * 2); c.fill();
    c.fillStyle = 'rgba(0,0,0,0.12)'; c.fillRect(0, h - 20, w, 20); grain(c, w, h, r, 100, 0.06, '90,70,40', '255,255,255', 10); vignette(c, w, h, 0.18);
  });
  T.dryerPanel = A.tile(176, 40, (c, w, h) => {
    c.fillStyle = '#d6d2c4'; c.fillRect(0, 0, w, h); c.fillStyle = '#3a3a3c'; c.fillRect(4, 5, w - 8, h - 10); dial(c, w * 0.25, h / 2, 11); dial(c, w * 0.75, h / 2, 11);
    c.fillStyle = '#e6dcc0'; c.font = `bold 7px ${FONT_SANS}`; c.textAlign = 'center'; c.fillText('PERMA-PRESS  ·  HIGH  ·  LOW', w / 2, h / 2 + 3);
  });
  T.detergent = A.tile(64, 96, (c, w, h) => {
    c.fillStyle = '#2a63b8'; c.fillRect(0, 0, w, h); c.fillStyle = '#f0c63c'; c.beginPath(); c.arc(w / 2, h * 0.42, 24, 0, PI * 2); c.fill();
    centred(c, 'SUDSY', w / 2, h * 0.42, `bold 16px ${FONT_BLK}`, '#1b3f80'); centred(c, 'GIANT SIZE', w / 2, h * 0.8, `bold 9px ${FONT_SANS}`, '#fff'); grain(c, w, h, r, 30, 0.08);
  });
  T.wicker = A.tile(96, 64, (c, w, h) => {
    c.fillStyle = '#c4a876'; c.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 5) { c.fillStyle = y % 10 ? 'rgba(90,60,20,0.35)' : 'rgba(255,235,190,0.22)'; c.fillRect(0, y, w, 2); }
    for (let x = 0; x < w; x += 6) { c.fillStyle = 'rgba(70,45,15,0.28)'; c.fillRect(x, 0, 1.5, h); } grain(c, w, h, r, 30, 0.1);
  });
  const clothTile = (base, fn, w, h, alphaShape) => A.tile(w, h, (c) => { c.clearRect(0, 0, w, h); c.save(); if (alphaShape) { alphaShape(c, w, h); c.clip(); } c.fillStyle = base; c.fillRect(0, 0, w, h); if (fn) fn(c, w, h); grain(c, w, h, r, 50, 0.07, '0,0,0', '255,255,255', 6); c.restore(); });
  T.jeans = clothTile('#32507c', (c, w, h) => { c.fillStyle = 'rgba(20,30,60,0.3)'; c.fillRect(w / 2 - 1, h * 0.4, 2, h); c.strokeStyle = '#d7a33a'; c.lineWidth = 1; c.beginPath(); c.moveTo(4, 14); c.lineTo(w - 4, 14); c.stroke(); for (let i = 0; i < 60; i++) { c.fillStyle = `rgba(160,190,230,${0.1 + r() * 0.1})`; c.fillRect(r() * w, r() * h, 1, 6 + r() * 14); } }, 64, 96,
    (c, w, h) => { c.beginPath(); c.moveTo(0, 0); c.lineTo(w, 0); c.lineTo(w, h * 0.46); c.lineTo(w * 0.98, h); c.lineTo(w * 0.56, h); c.lineTo(w * 0.5, h * 0.42); c.lineTo(w * 0.44, h); c.lineTo(w * 0.02, h); c.lineTo(0, h * 0.46); c.closePath(); });
  T.towel = clothTile('#e8e0cc', (c, w, h) => { for (let y = 8; y < h; y += 22) { c.fillStyle = '#c8462f'; c.fillRect(0, y, w, 6); c.fillStyle = '#e08a3a'; c.fillRect(0, y + 8, w, 3); } c.fillStyle = 'rgba(0,0,0,0.06)'; for (let x = 0; x < w; x += 3) c.fillRect(x, 0, 1, h); }, 64, 96);
  T.shirt = clothTile('#cdd6dc', (c, w, h) => { c.fillStyle = '#c62f2f'; c.fillRect(0, h * 0.32, w, h * 0.12); c.fillStyle = '#2a2f6b'; c.fillRect(0, h * 0.5, w, h * 0.06); }, 64, 80,
    (c, w, h) => { c.beginPath(); c.moveTo(w * 0.3, 0); c.lineTo(w * 0.7, 0); c.lineTo(w, h * 0.2); c.lineTo(w * 0.86, h * 0.34); c.lineTo(w * 0.76, h * 0.28); c.lineTo(w * 0.76, h); c.lineTo(w * 0.24, h); c.lineTo(w * 0.24, h * 0.28); c.lineTo(w * 0.14, h * 0.34); c.lineTo(0, h * 0.2); c.closePath(); });
  T.socks = clothTile('#f0ece0', (c, w, h) => { c.fillStyle = '#d34b2b'; c.fillRect(0, 0, w, 7); c.fillRect(0, 12, w, 3); }, 32, 48,
    (c, w, h) => { c.beginPath(); c.moveTo(w * 0.05, 0); c.lineTo(w * 0.95, 0); c.lineTo(w * 0.95, h * 0.55); c.lineTo(w * 0.7, h * 0.62); c.lineTo(w * 0.6, h * 0.95); c.lineTo(w * 0.1, h * 0.95); c.lineTo(w * 0.05, h * 0.6); c.closePath(); });

  // ---- cans and jars
  const can = (lab, ink, name, a) => A.tile(96, 80, (c, w, h) => {
    c.fillStyle = '#9aa2a8'; c.fillRect(0, 0, w, h); c.fillStyle = 'rgba(255,255,255,0.4)'; c.fillRect(0, 0, w, 6); c.fillRect(0, h - 6, w, 6);
    c.fillStyle = lab; c.fillRect(0, 12, w, h - 24); c.fillStyle = a; c.fillRect(0, 12, w, 10);
    centred(c, name, w / 2, h * 0.5, `bold 14px ${FONT_BLK}`, ink); c.fillStyle = ink; c.globalAlpha = 0.5; c.fillRect(w * 0.15, h * 0.68, w * 0.7, 3); c.fillRect(w * 0.25, h * 0.76, w * 0.5, 2); c.globalAlpha = 1;
    c.fillStyle = 'rgba(70,40,10,0.35)'; for (let i = 0; i < 5; i++) c.fillRect(r() * w, 12 + r() * (h - 28), 2 + r() * 7, 2 + r() * 3);    // drips
    c.fillStyle = 'rgba(0,0,0,0.18)'; c.fillRect(0, h - 3, w, 3);
  });
  T.canRed = can('#b3322a', '#f3ead6', 'BARN RED', '#7a1f19'); T.canBlue = can('#2f5f9a', '#f3ead6', 'SKY BLUE', '#1d3f6a'); T.canCream = can('#e6dcc0', '#3a2a1a', 'LATEX', '#b8a37a');
  T.canGreen = can('#41763f', '#f3ead6', 'FERN', '#27492a');
  T.canTop = A.tile(32, 32, (c, w, h) => { c.fillStyle = '#b4bbc0'; c.beginPath(); c.arc(w / 2, h / 2, w / 2, 0, PI * 2); c.fill(); c.strokeStyle = 'rgba(0,0,0,0.3)'; c.lineWidth = 2; c.beginPath(); c.arc(w / 2, h / 2, w * 0.34, 0, PI * 2); c.stroke(); c.fillStyle = 'rgba(160,40,30,0.5)'; c.fillRect(w * 0.3, h * 0.45, w * 0.3, 4); });
  const jar = (fill, a) => A.tile(48, 64, (c, w, h) => {
    c.fillStyle = 'rgba(205,225,220,1)'; c.fillRect(0, 0, w, h); c.fillStyle = fill; c.fillRect(3, 14, w - 6, h - 18); c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(3, h - 6, w - 6, 4);
    for (let i = 0; i < 40; i++) { c.fillStyle = `rgba(${a},${0.3 + r() * 0.5})`; c.fillRect(5 + r() * (w - 12), 16 + r() * (h - 26), 2, 1 + r() * 6); }
    c.fillStyle = '#b4a14a'; c.fillRect(0, 0, w, 11); c.fillStyle = 'rgba(0,0,0,0.25)'; for (let x = 2; x < w; x += 4) c.fillRect(x, 0, 1, 11);
    c.fillStyle = 'rgba(255,255,255,0.45)'; c.fillRect(w * 0.2, 16, 3, h - 26);
  });
  T.jarNails = jar('#6e6a62', '190,190,180'); T.jarScrews = jar('#7a6a4a', '210,180,90'); T.jarGreen = jar('#4f7a3e', '170,220,120'); T.jarHoney = jar('#c1832a', '255,220,120');
  T.coffee = A.tile(96, 80, (c, w, h) => {
    c.fillStyle = '#b42a20'; c.fillRect(0, 0, w, h); c.fillStyle = '#f3e2a8'; c.fillRect(0, h * 0.34, w, h * 0.3);
    centred(c, 'PERKY', w / 2, h * 0.19, `bold 17px ${FONT_BLK}`, '#f3e2a8'); centred(c, 'COFFEE', w / 2, h * 0.49, `bold 15px ${FONT_BLK}`, '#b42a20'); centred(c, '1 LB', w / 2, h * 0.82, `bold 10px ${FONT_SANS}`, '#f3e2a8');
    c.fillStyle = 'rgba(0,0,0,0.2)'; c.fillRect(0, 0, w, 5); c.fillRect(0, h - 5, w, 5); grain(c, w, h, r, 40, 0.12);
  });
  T.screws = A.tile(32, 32, (c, w, h) => { c.fillStyle = '#2a2420'; c.fillRect(0, 0, w, h); for (let i = 0; i < 90; i++) { c.fillStyle = `rgba(${170 + r() * 70},${160 + r() * 60},${130 + r() * 50},0.9)`; c.fillRect(r() * w, r() * h, 1 + r() * 3, 1); } });
  T.spray = A.tile(32, 64, (c, w, h) => { c.fillStyle = '#d6d6d0'; c.fillRect(0, 0, w, h); c.fillStyle = '#d8a41f'; c.fillRect(0, h * 0.3, w, h * 0.45); centred(c, 'GLIDE', w / 2, h * 0.5, `bold 9px ${FONT_BLK}`, '#222'); });

  // ---- the furnace, the water heater
  T.furnace = A.tile(176, 288, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, w, 0); g.addColorStop(0, '#6f7d77'); g.addColorStop(0.5, '#86948d'); g.addColorStop(1, '#6a7871'); c.fillStyle = g; c.fillRect(0, 0, w, h);
    c.fillStyle = '#4c5853'; c.fillRect(0, 0, w, 10); c.fillRect(0, h - 14, w, 14);
    for (let i = 0; i < 9; i++) { c.fillStyle = '#1d2421'; c.fillRect(w * 0.14, 24 + i * 9, w * 0.72, 4); c.fillStyle = 'rgba(255,255,255,0.12)'; c.fillRect(w * 0.14, 28 + i * 9, w * 0.72, 1); }   // louvres
    c.fillStyle = '#5c6a64'; rrect(c, w * 0.12, h * 0.3, w * 0.76, h * 0.42, 5); c.fill(); c.strokeStyle = '#2d3732'; c.lineWidth = 2; c.stroke();
    [[0.17, 0.33], [0.83, 0.33], [0.17, 0.69], [0.83, 0.69]].forEach(([x, y]) => { c.fillStyle = '#c2c7c3'; c.beginPath(); c.arc(w * x, h * y, 3, 0, PI * 2); c.fill(); });
    c.fillStyle = '#10110f'; rrect(c, w * 0.2, h * 0.38, w * 0.2, h * 0.07, 3); c.fill();                       // the pilot window
    c.fillStyle = '#d8d2b0'; rrect(c, w * 0.5, h * 0.4, w * 0.3, h * 0.17, 3); c.fill(); centred(c, 'BRIGHTHEARTH', w * 0.65, h * 0.45, `bold 8px ${FONT_SANS}`, '#2a2a22'); c.font = `6px ${FONT_SANS}`; c.fillStyle = '#2a2a22'; c.textAlign = 'center'; c.fillText('MODEL 80-F  ·  80,000 BTU', w * 0.65, h * 0.5);
    c.fillText('CAUTION: HOT SURFACES', w * 0.65, h * 0.54);
    c.fillStyle = '#c8262d'; c.fillRect(w * 0.2, h * 0.58, w * 0.18, h * 0.05);
    for (let i = 0; i < 6; i++) { c.fillStyle = '#1b2220'; c.fillRect(w * 0.14, h * 0.8 + i * 6, w * 0.72, 3); }
    grain(c, w, h, r, 200, 0.09, '40,30,20', '240,240,230', 14); c.fillStyle = 'rgba(120,70,30,0.18)'; for (let i = 0; i < 10; i++) c.fillRect(r() * w, r() * h, 3, 10 + r() * 30);
    vignette(c, w, h, 0.3);
  });
  T.heater = A.tile(320, 256, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, w, 0); g.addColorStop(0, '#d9d4c2'); g.addColorStop(0.15, '#ebe7d6'); g.addColorStop(0.5, '#e2ddca'); g.addColorStop(0.85, '#ebe7d6'); g.addColorStop(1, '#d9d4c2'); c.fillStyle = g; c.fillRect(0, 0, w, h);
    const fx = w * 0.5;                                                                                         // the front is the middle of the tile
    c.fillStyle = '#c93b2c'; c.fillRect(fx - 40, 54, 80, 70); c.fillStyle = '#fff'; c.font = `bold 11px ${FONT_SANS}`; c.textAlign = 'center'; c.fillText('WARNING', fx, 70);
    c.font = `7px ${FONT_SANS}`; ['SCALDING WATER', 'SET AT 120 F', 'DO NOT STORE', 'COMBUSTIBLES'].forEach((t, i) => c.fillText(t, fx, 84 + i * 10));
    c.fillStyle = '#2d5d91'; c.fillRect(fx - 40, 140, 80, 30); centred(c, 'GLOWWELL 40 GAL', fx, 150, `bold 9px ${FONT_SANS}`, '#fff'); c.font = `6px ${FONT_SANS}`; c.fillStyle = '#fff'; c.fillText('GAS  ·  NATURAL', fx, 162);
    c.fillStyle = '#35363a'; c.fillRect(fx - 28, 216, 56, 26); dial(c, fx, 229, 9, '#161616');
    c.fillStyle = 'rgba(120,80,40,0.25)'; for (let i = 0; i < 16; i++) c.fillRect(r() * w, 180 + r() * 76, 2, 10 + r() * 24);   // rust streaks
    grain(c, w, h, r, 260, 0.08, '70,55,30', '255,255,255', 16); c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(0, h - 10, w, 10); c.fillStyle = 'rgba(0,0,0,0.12)'; c.fillRect(0, 0, w, 8);
  });
  T.cap = A.tile(32, 32, (c, w, h) => { c.fillStyle = '#d8d3c0'; c.fillRect(0, 0, w, h); c.fillStyle = 'rgba(0,0,0,0.2)'; c.beginPath(); c.arc(w / 2, h / 2, 9, 0, PI * 2); c.fill(); });

  // ---- rugs
  T.rugBraid = A.tile(288, 288, (c, w, h) => {
    const cx = w / 2, cy = h / 2, bands = ['#8e3b22', '#e1c58b', '#4a3a28', '#c9862b', '#6b8a3d', '#8e3b22', '#e1c58b', '#4a3a28', '#c9862b'];
    c.fillStyle = bands[bands.length - 1]; c.fillRect(0, 0, w, h);
    let rad = w * 0.5 - 1; const bw = w * 0.5 / (bands.length + 1.2);
    for (let b = 0; b < bands.length; b++) {
      const rr = rad - b * bw;
      c.fillStyle = bands[b]; c.beginPath(); c.arc(cx, cy, rr, 0, PI * 2); c.fill();
      const n = Math.max(12, Math.round(rr * PI * 2 / 7));                                                       // the braid: a slanted stitch every few pixels
      for (let i = 0; i < n; i++) {
        const a = i / n * PI * 2, rm = rr - bw * 0.5, x = cx + Math.cos(a) * rm, y = cy + Math.sin(a) * rm;
        c.save(); c.translate(x, y); c.rotate(a + 0.7); c.fillStyle = 'rgba(0,0,0,0.22)'; c.fillRect(-1, -bw * 0.5, 2, bw); c.fillStyle = 'rgba(255,240,200,0.14)'; c.fillRect(1, -bw * 0.5, 1.5, bw); c.restore();
      }
      c.strokeStyle = 'rgba(0,0,0,0.3)'; c.lineWidth = 1.5; c.beginPath(); c.arc(cx, cy, rr, 0, PI * 2); c.stroke();
    }
    grain(c, w, h, r, 300, 0.08, '30,20,10', '255,240,200', 4);
  });
  T.rugStripe = A.tile(320, 208, (c, w, h) => {
    c.fillStyle = '#6a3b22'; c.fillRect(0, 0, w, h);
    const cols = ['#cf6d1e', '#e8d3a0', '#6e7d2e', '#a8431f', '#2f4a45'], bw = 14;
    for (let i = 0; i < 6; i++) { c.fillStyle = cols[i % cols.length]; c.fillRect(10 + i * bw, 10, bw - 2, h - 20); c.fillRect(w - 10 - (i + 1) * bw, 10, bw - 2, h - 20); }
    c.fillStyle = '#3a2418'; c.fillRect(104, 20, w - 208, h - 40);
    for (let k = 0; k < 4; k++) { const d = 34 - k * 8; c.fillStyle = cols[(k + 1) % cols.length]; c.beginPath(); c.moveTo(w / 2, h / 2 - d); c.lineTo(w / 2 + d * 1.5, h / 2); c.lineTo(w / 2, h / 2 + d); c.lineTo(w / 2 - d * 1.5, h / 2); c.closePath(); c.fill(); }
    for (const x0 of [-18, w + 18]) { c.strokeStyle = '#d9c9a0'; c.lineWidth = 2; for (let y = 8; y < h - 8; y += 5) { c.beginPath(); c.moveTo(x0 < 0 ? 10 : w - 10, y); c.lineTo(x0 < 0 ? 0 : w, y); c.stroke(); } }
    grain(c, w, h, r, 500, 0.09, '20,10,5', '255,235,200', 5);
  });

  // ---- the record corner
  T.consoleFront = A.tile(176, 72, (c, w, h) => {
    woodGrain(c, w, h, r, '#6e4a2b', '30,15,5');
    c.fillStyle = '#2b1f16'; for (const x of [6, w / 2 + 3]) { c.fillRect(x, 8, w / 2 - 9, h - 16); c.fillStyle = '#3b2b1d'; c.fillRect(x + 3, 11, w / 2 - 15, h - 22); c.fillStyle = '#2b1f16'; }
    c.fillStyle = '#c9a54d'; c.fillRect(w / 2 - 12, h / 2 - 5, 3, 10); c.fillRect(w / 2 + 9, h / 2 - 5, 3, 10);
    vignette(c, w, h, 0.25);
  });
  T.speaker = A.tile(96, 160, (c, w, h) => {
    woodGrain(c, w, h, r, '#5b3a22', '30,15,5', true); c.fillStyle = '#2d2a24'; c.fillRect(8, 10, w - 16, h - 20); const gg = '#48443b';
    for (let x = 8; x < w - 8; x += 3) { c.fillStyle = gg; c.fillRect(x, 10, 1, h - 20); } for (let y = 10; y < h - 10; y += 3) { c.fillStyle = gg; c.fillRect(8, y, w - 16, 1); }
    c.strokeStyle = 'rgba(0,0,0,0.5)'; c.lineWidth = 3; c.beginPath(); c.arc(w / 2, h * 0.64, 26, 0, PI * 2); c.stroke(); c.beginPath(); c.arc(w / 2, h * 0.2, 11, 0, PI * 2); c.stroke();
  });
  T.vinyl = A.tile(96, 96, (c, w, h) => {
    c.fillStyle = '#17171a'; c.fillRect(0, 0, w, h); c.fillStyle = '#111'; c.beginPath(); c.arc(w / 2, h / 2, w / 2 - 1, 0, PI * 2); c.fill();
    for (let rr = 18; rr < w / 2 - 2; rr += 2) { c.strokeStyle = `rgba(255,255,255,${0.03 + r() * 0.04})`; c.lineWidth = 1; c.beginPath(); c.arc(w / 2, h / 2, rr, 0, PI * 2); c.stroke(); }
    c.fillStyle = '#c6962c'; c.beginPath(); c.arc(w / 2, h / 2, 15, 0, PI * 2); c.fill(); c.fillStyle = '#222'; c.beginPath(); c.arc(w / 2, h / 2, 2.5, 0, PI * 2); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.1)'; c.beginPath(); c.moveTo(w / 2, h / 2); c.arc(w / 2, h / 2, w / 2 - 2, -0.9, -0.35); c.closePath(); c.fill();
  });
  const sleeve = (bg, fg, t1, t2, shape) => A.tile(64, 64, (c, w, h) => {
    c.fillStyle = bg; c.fillRect(0, 0, w, h); c.fillStyle = fg; shape(c, w, h); centred(c, t1, w / 2, 11, `bold 9px ${FONT_BLK}`, '#fff', ['#000', 2]); centred(c, t2, w / 2, h - 8, `bold 7px ${FONT_SANS}`, '#fff');
    grain(c, w, h, r, 40, 0.1); c.strokeStyle = 'rgba(0,0,0,0.4)'; c.lineWidth = 1; c.strokeRect(0.5, 0.5, w - 1, h - 1);
  });
  T.sleeves = [
    sleeve('#2a0f4a', '#ff4fa3', 'THE VELVET', 'PYLONS', (c, w, h) => { for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(14 + i * 16, h * 0.72); c.lineTo(22 + i * 16, h * 0.3 + i * 4); c.lineTo(30 + i * 16, h * 0.72); c.fill(); } }),
    sleeve('#0e3b4a', '#ffd04a', 'NEON', 'CASSETTE', (c, w, h) => { c.beginPath(); c.arc(w / 2, h * 0.52, 16, 0, PI * 2); c.fill(); c.fillStyle = '#0e3b4a'; c.beginPath(); c.arc(w / 2 - 7, h * 0.52, 4, 0, PI * 2); c.arc(w / 2 + 7, h * 0.52, 4, 0, PI * 2); c.fill(); }),
    sleeve('#7a1f19', '#f0e0b0', 'STATIC', 'ORCHARD', (c, w, h) => { for (let i = 0; i < 5; i++) { c.beginPath(); c.arc(14 + i * 9, h * 0.55 + (i % 2) * 6, 7, 0, PI * 2); c.fill(); } }),
    sleeve('#1c5a3a', '#e8f0a0', 'ROLLER', 'DISCO 82', (c, w, h) => { c.fillRect(w * 0.2, h * 0.5, w * 0.6, 6); c.beginPath(); c.arc(w * 0.3, h * 0.72, 7, 0, PI * 2); c.arc(w * 0.7, h * 0.72, 7, 0, PI * 2); c.fill(); }),
  ];
  T.crate = A.tile(96, 64, (c, w, h) => { c.fillStyle = '#2f6fb0'; c.fillRect(0, 0, w, h); c.fillStyle = 'rgba(0,0,0,0.3)'; for (let x = 6; x < w; x += 12) c.fillRect(x, 6, 7, h - 12); c.fillStyle = 'rgba(255,255,255,0.12)'; c.fillRect(0, 0, w, 4); grain(c, w, h, r, 40, 0.08); });
  T.recEdges = A.tile(64, 64, (c, w, h) => { c.fillStyle = '#222'; c.fillRect(0, 0, w, h); const cs = ['#d8c8a0', '#b3322a', '#2f6fb0', '#e0a63a', '#4a7a3a', '#6a3c78', '#eee']; for (let x = 2; x < w - 2; x += 3) { c.fillStyle = cs[Math.floor(r() * cs.length)]; c.fillRect(x, 6, 2 + (r() < 0.3 ? 1 : 0), h - 12); } });
  T.bean = A.tile(96, 96, (c, w, h) => {
    c.fillStyle = '#d9631a'; c.fillRect(0, 0, w, h); for (let i = 0; i < 9; i++) { c.fillStyle = `rgba(${r() < 0.5 ? '120,40,5' : '255,170,90'},${0.1 + r() * 0.1})`; c.beginPath(); c.ellipse(r() * w, r() * h, 8 + r() * 22, 2 + r() * 5, r() * PI, 0, PI * 2); c.fill(); }
    c.strokeStyle = 'rgba(90,30,5,0.5)'; c.lineWidth = 2; c.beginPath(); c.moveTo(w * 0.5, 0); c.lineTo(w * 0.5, h); c.moveTo(0, h * 0.5); c.lineTo(w, h * 0.5); c.stroke();
    c.fillStyle = 'rgba(80,25,5,0.4)'; for (let i = 0; i < 4; i++) c.fillRect(r() * w, r() * h, 3, 1);   // a repair
  });
  T.dartboard = A.tile(160, 160, (c, w, h) => {
    woodGrain(c, w, h, r, '#3a2416', '10,5,2', true); c.fillStyle = 'rgba(0,0,0,0.3)'; c.fillRect(0, 0, w, 4); c.fillRect(0, h - 4, w, 4);
    const cx = w / 2, cy = h / 2, R = 62, S = 20, order = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];
    c.fillStyle = '#121212'; c.beginPath(); c.arc(cx, cy, R, 0, PI * 2); c.fill();
    for (let i = 0; i < S; i++) {
      const a0 = (i - 0.5) / S * PI * 2 - PI / 2, a1 = (i + 0.5) / S * PI * 2 - PI / 2, odd = i % 2;
      const ring = (r0, r1, colr) => { c.fillStyle = colr; c.beginPath(); c.arc(cx, cy, R * r1, a0, a1); c.arc(cx, cy, R * r0, a1, a0, true); c.closePath(); c.fill(); };
      ring(0.094, 0.582, odd ? '#e8dcb4' : '#171717'); ring(0.582, 0.629, odd ? '#2f7a3a' : '#b3322a'); ring(0.629, 0.953, odd ? '#e8dcb4' : '#171717'); ring(0.953, 1.0, odd ? '#2f7a3a' : '#b3322a');
      c.save(); c.translate(cx, cy); c.rotate(i / S * PI * 2); c.fillStyle = '#e8e8e8'; c.font = `bold 9px ${FONT_SANS}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(order[i]), 0, -R - 8); c.restore();
    }
    c.fillStyle = '#2f7a3a'; c.beginPath(); c.arc(cx, cy, R * 0.094, 0, PI * 2); c.fill(); c.fillStyle = '#b3322a'; c.beginPath(); c.arc(cx, cy, R * 0.037, 0, PI * 2); c.fill();
    c.strokeStyle = 'rgba(200,200,200,0.35)'; c.lineWidth = 0.7; for (let i = 0; i < S; i++) { const a = (i - 0.5) / S * PI * 2 - PI / 2; c.beginPath(); c.moveTo(cx + Math.cos(a) * R * 0.094, cy + Math.sin(a) * R * 0.094); c.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); c.stroke(); }
    c.strokeStyle = 'rgba(0,0,0,0.5)'; c.lineWidth = 4; c.beginPath(); c.arc(cx, cy, R + 14, 0, PI * 2); c.stroke();
    for (let i = 0; i < 14; i++) { c.fillStyle = 'rgba(0,0,0,0.5)'; c.fillRect(cx + (r() - 0.5) * 120, cy + (r() - 0.5) * 120, 1.5, 1.5); }
  });
  T.pong = A.tile(256, 144, (c, w, h) => {
    c.fillStyle = '#1d5c4a'; c.fillRect(0, 0, w, h); grain(c, w, h, r, 160, 0.07, '0,20,10', '120,200,160', 6);
    c.strokeStyle = '#e8eadc'; c.lineWidth = 3; c.strokeRect(5, 5, w - 10, h - 10); c.lineWidth = 2; c.beginPath(); c.moveTo(w / 2, 5); c.lineTo(w / 2, h - 5); c.moveTo(5, h / 2); c.lineTo(w - 5, h / 2); c.stroke();
    c.fillStyle = 'rgba(0,0,0,0.18)'; for (let i = 0; i < 7; i++) { c.beginPath(); c.arc(r() * w, r() * h, 2 + r() * 7, 0, PI * 2); c.fill(); }      // dings and a coffee ring
  });
  T.net = A.tile(96, 16, (c, w, h) => {
    c.clearRect(0, 0, w, h); c.fillStyle = '#ece8dc'; c.fillRect(0, 0, w, 4);
    c.strokeStyle = 'rgba(235,235,225,0.9)'; c.lineWidth = 1; for (let x = 0; x < w; x += 4) { c.beginPath(); c.moveTo(x, 4); c.lineTo(x, h); c.stroke(); } for (let y = 6; y < h; y += 4) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); }
  });
  T.paddle = A.tile(32, 32, (c, w, h) => { c.fillStyle = '#b3271f'; c.fillRect(0, 0, w, h); grain(c, w, h, r, 20, 0.15); });
  T.skate = A.tile(48, 192, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#1d1b2b'); g.addColorStop(1, '#2a1b2e'); c.fillStyle = g; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 5; i++) { c.fillStyle = ['#ff7a1a', '#ffc21a', '#e8362a'][i % 3]; c.beginPath(); c.moveTo(6 + i * 8, h * 0.9); c.quadraticCurveTo(w * 0.1 + i * 7, h * 0.55, 10 + i * 6, h * (0.28 - i * 0.02)); c.quadraticCurveTo(22 + i * 5, h * 0.5, 16 + i * 8, h * 0.9); c.fill(); }
    centred(c, 'RAD', w / 2, h * 0.1, `bold 20px ${FONT_BLK}`, '#ffe46a', ['#000', 3]); grain(c, w, h, r, 90, 0.14, '0,0,0', '255,255,255', 6);
    c.fillStyle = 'rgba(0,0,0,0.5)'; c.fillRect(0, 0, w, 3); c.fillRect(0, h - 3, w, 3);
  });
  T.skateWheel = A.tile(16, 16, (c, w, h) => { c.fillStyle = '#e9d9a5'; c.fillRect(0, 0, w, h); c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(0, h - 4, w, 4); });
  T.tape = A.tile(16, 16, (c, w, h) => { c.fillStyle = '#e6e1cf'; c.fillRect(0, 0, w, h); });
  T.bulb = A.tile(8, 8, (c, w, h) => { c.fillStyle = '#fff'; c.fillRect(0, 0, w, h); });
  T.lampShade = A.tile(32, 32, (c, w, h) => { c.fillStyle = '#c8c4b2'; c.fillRect(0, 0, w, h); });

  // ---- 1982 posters (invented titles, bands and games)
  const poster = (w, h, fn) => A.tile(w, h, (c) => { fn(c, w, h); grain(c, w, h, r, 90, 0.08); c.fillStyle = 'rgba(255,255,255,0.1)'; c.fillRect(0, 0, w, 2); c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(0, h - 3, w, 3); c.fillRect(0, 0, 2, h); c.fillRect(w - 2, 0, 2, h); });
  T.posterMoon = poster(160, 224, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#05080f'); g.addColorStop(0.6, '#10202e'); g.addColorStop(1, '#1b0f14'); c.fillStyle = g; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 40; i++) { c.fillStyle = '#fff'; c.globalAlpha = 0.3 + r() * 0.6; c.fillRect(r() * w, r() * h * 0.6, 1, 1); } c.globalAlpha = 1;
    const m = c.createRadialGradient(w * 0.55, h * 0.36, 6, w * 0.55, h * 0.36, 54); m.addColorStop(0, '#ffd9a0'); m.addColorStop(1, '#ff7a2a'); c.fillStyle = m; c.beginPath(); c.arc(w * 0.55, h * 0.36, 52, 0, PI * 2); c.fill();
    c.fillStyle = '#0a0d12'; c.beginPath(); c.moveTo(0, h * 0.78); c.lineTo(30, h * 0.66); c.lineTo(60, h * 0.76); c.lineTo(96, h * 0.62); c.lineTo(140, h * 0.74); c.lineTo(w, h * 0.7); c.lineTo(w, h); c.lineTo(0, h); c.fill();
    c.fillStyle = '#3a4a5a'; c.beginPath(); c.arc(w * 0.28, h * 0.58, 14, 0, PI * 2); c.fill(); c.fillStyle = '#ff9f2a'; c.fillRect(w * 0.28 - 10, h * 0.58 - 3, 20, 6);
    centred(c, 'MOONBASE', w / 2, h * 0.84, `bold 28px ${FONT_BLK}`, '#ff4a2a', ['#2a0a05', 4]); centred(c, 'MUTINY', w / 2, h * 0.93, `bold 24px ${FONT_BLK}`, '#ffd04a', ['#2a0a05', 4]);
    centred(c, 'THE CREW WANTS OUT', w / 2, h * 0.04, `bold 8px ${FONT_SANS}`, '#9fd0e8');
  });
  T.posterBand = poster(160, 224, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#2a0f4a'); g.addColorStop(0.55, '#7a1d6a'); g.addColorStop(1, '#ff7a3a'); c.fillStyle = g; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 7; i++) { c.fillStyle = `rgba(255,${120 + i * 14},${200 - i * 20},0.9)`; c.fillRect(0, h * 0.5 + i * 7 + i * i * 0.6, w, 3 + i * 0.4); }
    c.fillStyle = '#12091f'; for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(24 + i * 46, h * 0.5); c.lineTo(46 + i * 46, h * 0.14 + i * 8); c.lineTo(68 + i * 46, h * 0.5); c.fill(); }
    c.fillStyle = '#ffe9a8'; c.beginPath(); c.arc(w / 2, h * 0.5, 22, PI, 0); c.fill();
    centred(c, 'THE VELVET', w / 2, h * 0.07, `bold 22px ${FONT_BLK}`, '#ffe9a8', ['#2a0f4a', 4]); centred(c, 'PYLONS', w / 2, h * 0.16, `bold 28px ${FONT_BLK}`, '#ff5fa8', ['#2a0f4a', 4]);
    centred(c, 'LIVE AT THE ROLLERDOME', w / 2, h * 0.88, `bold 10px ${FONT_SANS}`, '#fff'); centred(c, 'FRI NOV 12  ·  8 PM', w / 2, h * 0.94, `bold 9px ${FONT_SANS}`, '#ffd9a8');
  });
  T.posterGopher = poster(160, 224, (c, w, h) => {
    c.fillStyle = '#ffd43a'; c.fillRect(0, 0, w, h); for (let i = 0; i < 18; i++) { const a = i / 18 * PI * 2; c.fillStyle = i % 2 ? '#ff9a1a' : '#ffbc2a'; c.beginPath(); c.moveTo(w / 2, h * 0.45); c.arc(w / 2, h * 0.45, 200, a, a + PI / 18); c.fill(); }
    c.fillStyle = '#8a5a2e'; c.beginPath(); c.arc(w / 2, h * 0.5, 44, 0, PI * 2); c.fill(); c.fillStyle = '#c99a62'; c.beginPath(); c.ellipse(w / 2, h * 0.58, 26, 20, 0, 0, PI * 2); c.fill();
    c.fillStyle = '#fff'; c.beginPath(); c.arc(w / 2 - 17, h * 0.45, 12, 0, PI * 2); c.arc(w / 2 + 17, h * 0.45, 12, 0, PI * 2); c.fill(); c.fillStyle = '#111'; c.beginPath(); c.arc(w / 2 - 15, h * 0.46, 5, 0, PI * 2); c.arc(w / 2 + 15, h * 0.46, 5, 0, PI * 2); c.fill();
    c.fillStyle = '#fff'; c.fillRect(w / 2 - 8, h * 0.6, 7, 11); c.fillRect(w / 2 + 1, h * 0.6, 7, 11); c.fillStyle = '#3a2412'; c.beginPath(); c.arc(w / 2, h * 0.56, 5, 0, PI * 2); c.fill();
    c.fillStyle = '#5a3a1a'; c.beginPath(); c.arc(w / 2 - 40, h * 0.34, 12, 0, PI * 2); c.arc(w / 2 + 40, h * 0.34, 12, 0, PI * 2); c.fill();
    centred(c, 'COSMIC', w / 2, h * 0.09, `bold 34px ${FONT_BLK}`, '#2a56c8', ['#fff', 5]); centred(c, 'GOPHER', w / 2, h * 0.2, `bold 34px ${FONT_BLK}`, '#c8262d', ['#fff', 5]);
    centred(c, 'INSERT COIN', w / 2, h * 0.9, `bold 15px ${FONT_BLK}`, '#2a56c8'); centred(c, '¢ 25 ¢', w / 2, h * 0.96, `bold 9px ${FONT_SANS}`, '#222');
  });
  T.posterTape = poster(144, 192, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#0d1b3a'); g.addColorStop(1, '#2b0f3a'); c.fillStyle = g; c.fillRect(0, 0, w, h);
    c.fillStyle = '#d9d2c0'; rrect(c, 14, h * 0.28, w - 28, h * 0.34, 6); c.fill(); c.fillStyle = '#17171a'; rrect(c, 24, h * 0.34, w - 48, h * 0.14, 4); c.fill();
    c.fillStyle = '#f0e8d0'; for (const x of [w * 0.34, w * 0.66]) { c.beginPath(); c.arc(x, h * 0.41, 9, 0, PI * 2); c.fill(); c.fillStyle = '#17171a'; c.beginPath(); c.arc(x, h * 0.41, 3, 0, PI * 2); c.fill(); c.fillStyle = '#f0e8d0'; }
    for (let i = 0; i < 6; i++) { c.fillStyle = ['#ff3d7f', '#ff9a3d', '#ffe03d', '#3dffb0', '#3d9aff', '#b03dff'][i]; c.fillRect(0, h * 0.7 + i * 5, w, 3.5); }
    centred(c, 'NEON', w / 2, h * 0.08, `bold 28px ${FONT_BLK}`, '#3dffe0', ['#08122a', 4]); centred(c, 'CASSETTE', w / 2, h * 0.17, `bold 24px ${FONT_BLK}`, '#ff3d7f', ['#08122a', 4]);
    centred(c, 'WORLD TOUR 82', w / 2, h * 0.94, `bold 11px ${FONT_SANS}`, '#fff');
  });
  T.posterLizard = poster(144, 192, (c, w, h) => {
    c.fillStyle = '#10142a'; c.fillRect(0, 0, w, h); c.strokeStyle = '#3df0a5'; c.lineWidth = 1; for (let i = 0; i < 10; i++) { c.beginPath(); c.moveTo(0, h * 0.5 + i * 12); c.lineTo(w, h * 0.5 + i * 12); c.stroke(); }
    for (let i = -6; i < 7; i++) { c.beginPath(); c.moveTo(w / 2, h * 0.5); c.lineTo(w / 2 + i * 34, h); c.stroke(); }
    c.fillStyle = '#3df0a5'; c.beginPath(); c.moveTo(24, h * 0.42); c.quadraticCurveTo(50, h * 0.2, 96, h * 0.3); c.quadraticCurveTo(122, h * 0.34, 130, h * 0.45); c.lineTo(100, h * 0.42); c.quadraticCurveTo(70, h * 0.36, 40, h * 0.48); c.fill();
    c.fillStyle = '#ff3d7f'; c.beginPath(); c.arc(100, h * 0.34, 4, 0, PI * 2); c.fill();
    centred(c, 'LASER', w / 2, h * 0.07, `bold 26px ${FONT_BLK}`, '#3df0a5', ['#03140e', 4]); centred(c, 'LIZARD', w / 2, h * 0.16, `bold 26px ${FONT_BLK}`, '#ff3d7f', ['#03140e', 4]);
    centred(c, 'NEW AT THE ARCADE', w / 2, h * 0.93, `bold 10px ${FONT_SANS}`, '#e8f8f0');
  });
  T.posterRoller = poster(144, 192, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#ff5f2e'); g.addColorStop(1, '#ffc02e'); c.fillStyle = g; c.fillRect(0, 0, w, h);
    c.fillStyle = '#1a1030'; c.beginPath(); c.arc(w / 2, h * 0.5, 40, 0, PI * 2); c.fill();
    for (let i = 0; i < 12; i++) { const a = i / 12 * PI * 2; c.fillStyle = i % 2 ? '#ff5fa8' : '#3dd5ff'; c.beginPath(); c.moveTo(w / 2, h * 0.5); c.arc(w / 2, h * 0.5, 36, a, a + PI / 12); c.fill(); }
    c.fillStyle = '#1a1030'; c.fillRect(w * 0.18, h * 0.46, w * 0.64, 4); c.beginPath(); c.arc(w * 0.3, h * 0.66, 9, 0, PI * 2); c.arc(w * 0.7, h * 0.66, 9, 0, PI * 2); c.fill();
    centred(c, 'ROLLERDOME', w / 2, h * 0.1, `bold 25px ${FONT_BLK}`, '#1a1030', ['#fff', 4]); centred(c, 'SKATE NIGHT', w / 2, h * 0.2, `bold 17px ${FONT_BLK}`, '#fff', ['#1a1030', 3]);
    centred(c, 'EVERY FRIDAY  ·  75¢', w / 2, h * 0.92, `bold 10px ${FONT_SANS}`, '#1a1030');
  });
  T.posterOrchard = poster(144, 192, (c, w, h) => {
    c.fillStyle = '#e8dcc0'; c.fillRect(0, 0, w, h); c.fillStyle = '#7a1f19'; c.fillRect(0, 0, w, h * 0.12); c.fillRect(0, h * 0.88, w, h * 0.12);
    for (let i = 0; i < 9; i++) { c.fillStyle = i % 2 ? '#2f6b3a' : '#4a8a3a'; c.beginPath(); c.arc(18 + i * 13, h * 0.5 + Math.sin(i) * 12, 11, 0, PI * 2); c.fill(); c.fillStyle = '#b3322a'; c.beginPath(); c.arc(18 + i * 13, h * 0.5 + Math.sin(i) * 12 + 14, 5, 0, PI * 2); c.fill(); }
    c.strokeStyle = '#3a2412'; c.lineWidth = 3; c.beginPath(); c.moveTo(0, h * 0.7); c.lineTo(w, h * 0.7); c.stroke();
    centred(c, 'STATIC', w / 2, h * 0.28, `bold 30px ${FONT_BLK}`, '#7a1f19', ['#e8dcc0', 3]); centred(c, 'ORCHARD', w / 2, h * 0.38, `bold 26px ${FONT_BLK}`, '#7a1f19', ['#e8dcc0', 3]);
    centred(c, 'THE NEW ALBUM', w / 2, h * 0.07, `bold 10px ${FONT_SANS}`, '#e8dcc0'); centred(c, 'ON TAPE AND RECORD', w / 2, h * 0.8, `bold 10px ${FONT_SANS}`, '#3a2412'); centred(c, 'IN STORES NOW', w / 2, h * 0.94, `bold 10px ${FONT_SANS}`, '#e8dcc0');
  });
  // ---- the wake wall (look batch 3c): what hangs and stands around the TV, drawn to the concept art (workshop/docs/concepts/basement_brief/38_w1_polish_storyboard/01_basement_finished.png).
  // Every name is invented. The tiles with a cleared background (leaves) are alpha-tested on the cloth mesh. Its own random stream, so the older tiles do not shift.
  const q = rng(1983);
  const FONT_SERIF = 'Georgia,"Times New Roman","Liberation Serif",serif';
  // STARVECTOR, the game's own arcade game, as a poster: its cabinet's navy and red, the wire-frame ship, a moon, laser streaks, the lettering low
  T.posterStar = poster(232, 340, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#0a0c24'); g.addColorStop(0.5, '#1c1240'); g.addColorStop(0.78, '#4a1838'); g.addColorStop(1, '#14081c'); c.fillStyle = g; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 90; i++) { c.fillStyle = '#fff'; c.globalAlpha = 0.25 + q() * 0.7; const s = q() < 0.1 ? 2 : 1; c.fillRect(q() * w, q() * h * 0.7, s, s); } c.globalAlpha = 1;
    const m = c.createRadialGradient(w * 0.8, h * 0.25, 3, w * 0.8, h * 0.25, 38); m.addColorStop(0, '#d8d4ee'); m.addColorStop(0.7, '#8f8ab0'); m.addColorStop(1, '#5a5480'); c.fillStyle = m; c.beginPath(); c.arc(w * 0.8, h * 0.25, 30, 0, PI * 2); c.fill();
    c.fillStyle = 'rgba(40,36,70,0.38)'; for (const [dx, dy, rr] of [[-14, 6, 5], [6, 14, 4], [14, -2, 3], [-6, -12, 3.5], [3, -2, 2]]) { c.beginPath(); c.arc(w * 0.8 + dx, h * 0.25 + dy, rr, 0, PI * 2); c.fill(); }
    for (const [x0, y0, x1, y1, a] of [[w * 0.02, h * 0.5, w * 0.98, h * 0.2, 0.9], [w * 0.1, h * 0.7, w * 0.86, h * 0.44, 0.6]]) {           // the laser streaks, hot core in a red glow
      c.save(); c.shadowColor = '#ff3a20'; c.shadowBlur = 8; c.strokeStyle = `rgba(255,96,56,${a})`; c.lineWidth = 2.6; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke(); c.restore();
      c.strokeStyle = `rgba(255,214,170,${a})`; c.lineWidth = 0.9; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
    }
    const cl = (x, y, rx, ry, col) => { const rg = c.createRadialGradient(x, y, 1, x, y, rx); rg.addColorStop(0, col); rg.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = rg; c.save(); c.translate(0, y); c.scale(1, ry / rx); c.translate(0, -y); c.beginPath(); c.arc(x, y, rx, 0, PI * 2); c.fill(); c.restore(); };
    cl(w * 0.18, h * 0.8, 70, 26, 'rgba(210,60,90,0.65)'); cl(w * 0.78, h * 0.78, 80, 28, 'rgba(255,120,60,0.55)'); cl(w * 0.5, h * 0.86, 100, 30, 'rgba(120,30,90,0.7)');
    c.fillStyle = '#12061c'; c.beginPath(); c.moveTo(0, h * 0.86); for (let i = 0; i <= 12; i++) c.lineTo(i / 12 * w, h * (0.84 + 0.03 * Math.sin(i * 2.1) + 0.01 * (i % 2))); c.lineTo(w, h); c.lineTo(0, h); c.fill();
    // the ship: a long needle with two swept fins, in glowing wire
    const wire = (pts, close) => { c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); if (close) c.closePath(); c.stroke(); };
    c.save(); c.shadowColor = '#b9a0ff'; c.shadowBlur = 7; c.strokeStyle = '#d8cbff'; c.lineWidth = 1.3; c.lineJoin = 'round';
    const cx = w * 0.4;
    wire([[cx, h * 0.17], [cx + 6, h * 0.46], [cx + 5, h * 0.66], [cx - 5, h * 0.66], [cx - 6, h * 0.46]], true);
    wire([[cx - 6, h * 0.46], [cx - 54, h * 0.7], [cx - 20, h * 0.66], [cx - 5, h * 0.66]], true); wire([[cx + 6, h * 0.46], [cx + 54, h * 0.7], [cx + 20, h * 0.66], [cx + 5, h * 0.66]], true);
    wire([[cx, h * 0.17], [cx, h * 0.66]]); wire([[cx - 6, h * 0.46], [cx + 6, h * 0.46]]); wire([[cx - 5, h * 0.56], [cx + 5, h * 0.56]]);
    wire([[cx - 54, h * 0.7], [cx - 30, h * 0.58], [cx - 6, h * 0.46]]); wire([[cx + 54, h * 0.7], [cx + 30, h * 0.58], [cx + 6, h * 0.46]]);
    wire([[cx - 3, h * 0.66], [cx - 3, h * 0.72]]); wire([[cx + 3, h * 0.66], [cx + 3, h * 0.72]]);
    c.restore();
    c.save(); c.letterSpacing = '4px'; centred(c, 'STARVECTOR', w / 2, h * 0.925, `bold 22px ${FONT_SANS}`, '#d7a7ff', ['#14041f', 3]); c.restore();
    centred(c, 'ONLY AT THE JUNCTION', w / 2, h * 0.975, `bold 7px ${FONT_SANS}`, '#c9b8e8');
  });
  // a dark red felt pennant with a gold sword in a compass ring and two long gold stripes (tile space: the pennant fills it, point at the right-hand middle)
  T.pennant = A.tile(352, 176, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, w, 0); g.addColorStop(0, '#5a0f18'); g.addColorStop(1, '#3c0a12'); c.fillStyle = g; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) { c.fillStyle = `rgba(${q() < 0.5 ? '255,200,170' : '20,0,0'},${(0.03 + q() * 0.07).toFixed(3)})`; c.fillRect(q() * w, q() * h, 1 + q() * 2, 1); }          // felt nap
    const gold = '#cf9f45', dgold = '#8d6424';
    c.strokeStyle = 'rgba(200,150,70,0.7)'; c.lineWidth = 2; c.beginPath(); c.moveTo(3, 2); c.lineTo(w - 4, h / 2); c.lineTo(3, h - 2); c.closePath(); c.stroke();        // a stitched edge
    const ex = 66, ey = h / 2, R = 44;                                                                                                       // the emblem: ring, eight compass points, a sword
    c.strokeStyle = gold; c.lineWidth = 3; c.beginPath(); c.arc(ex, ey, R, 0, PI * 2); c.stroke(); c.lineWidth = 1.5; c.beginPath(); c.arc(ex, ey, R - 7, 0, PI * 2); c.stroke();
    c.fillStyle = gold; for (let i = 0; i < 8; i++) { const a = i / 8 * PI * 2, rr = i % 2 ? 11 : 20; c.save(); c.translate(ex, ey); c.rotate(a); c.beginPath(); c.moveTo(0, -R + 7); c.lineTo(rr * 0.4, -R + 7 + rr); c.lineTo(-rr * 0.4, -R + 7 + rr); c.fill(); c.restore(); }
    c.fillStyle = '#4a0c14'; c.beginPath(); c.arc(ex, ey, 17, 0, PI * 2); c.fill();
    c.fillStyle = gold; c.beginPath(); c.moveTo(ex, ey - 40); c.lineTo(ex + 4.5, ey - 12); c.lineTo(ex + 3, ey + 16); c.lineTo(ex - 3, ey + 16); c.lineTo(ex - 4.5, ey - 12); c.fill();
    c.fillRect(ex - 14, ey + 14, 28, 4.5); c.fillRect(ex - 2.2, ey + 18, 4.4, 15); c.beginPath(); c.arc(ex, ey + 36, 4, 0, PI * 2); c.fill();
    c.fillStyle = dgold; c.fillRect(ex - 0.8, ey - 38, 1.6, 50);
    for (const [y0, y1, x0, th] of [[0.52, 0.52, 150, 12], [0.64, 0.6, 170, 9]]) {                                                                // two gold stripes toward the point, tapering with the cloth
      c.fillStyle = gold; c.beginPath(); c.moveTo(x0, h * y0 - th / 2 + (x0 - 150) * 0.0); c.lineTo(w * 0.86, h * 0.5 - 1); c.lineTo(w * 0.86, h * 0.5 + 2); c.lineTo(x0, h * y0 + th / 2); c.fill();
    }
    grain(c, w, h, q, 120, 0.05, '30,0,0', '255,220,180', 6);
  });
  // a hand-written note, taped up (words from the concept art)
  T.noteHand = A.tile(190, 252, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#f3ead3'); g.addColorStop(1, '#e4d8bb'); c.fillStyle = g; c.fillRect(0, 0, w, h);
    grain(c, w, h, q, 120, 0.05, '90,70,30', '255,255,240', 8);
    c.strokeStyle = 'rgba(120,90,40,0.16)'; c.lineWidth = 1; c.beginPath(); c.moveTo(0, h * 0.5); c.lineTo(w, h * 0.5 + 2); c.stroke(); c.beginPath(); c.moveTo(w * 0.5, 0); c.lineTo(w * 0.5 + 3, h); c.stroke();          // the folds
    const ink = '#12101c';
    [['Gone up.', 0.14], ['Dinner’s in', 0.26], ['the fridge.', 0.37], ['Don’t stay down', 0.52], ['there all night.', 0.63]].forEach(([t, y], i) => hand(c, t, w * (0.5 + (i % 2) * 0.02), h * y, 20.5, ink, q, FONT_HAND));
    hand(c, '♡ Mom', w * 0.64, h * 0.82, 21, ink, q, FONT_HAND);
    c.fillStyle = 'rgba(0,0,0,0.12)'; c.fillRect(0, h - 3, w, 3);
  });
  T.tapeStrip = A.tile(32, 16, (c, w, h) => { c.fillStyle = '#d8c690'; c.fillRect(0, 0, w, h); grain(c, w, h, q, 12, 0.2, '120,100,50', '255,250,220', 6); c.fillStyle = 'rgba(255,255,255,0.25)'; c.fillRect(0, 0, w, 3); });
  // the three big fantasy rule books' spines (lying flat, spine out: 0.29 m x 0.05 m)
  const spine = (bg0, bg1, fn) => A.tile(420, 76, (c, w, h) => { const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, bg0); g.addColorStop(1, bg1); c.fillStyle = g; c.fillRect(0, 0, w, h); grain(c, w, h, q, 160, 0.06, '0,0,0', '255,255,255', 8); fn(c, w, h); c.fillStyle = 'rgba(0,0,0,0.3)'; c.fillRect(0, 0, w, 3); c.fillRect(0, h - 4, w, 4); });
  const goldC = '#d9ac4a';
  T.bookEmber = spine('#8a1a24', '#5e0f18', (c, w, h) => {
    c.strokeStyle = goldC; c.lineWidth = 2; c.strokeRect(10, 9, w - 20, h - 18);
    const ex = 52, ey = h / 2; c.beginPath(); c.arc(ex, ey, 21, 0, PI * 2); c.stroke(); c.fillStyle = goldC; for (let i = 0; i < 8; i++) { c.save(); c.translate(ex, ey); c.rotate(i / 8 * PI * 2); c.beginPath(); c.moveTo(0, -20); c.lineTo(i % 2 ? 3 : 4.5, -(i % 2 ? 8 : 4)); c.lineTo(-(i % 2 ? 3 : 4.5), -(i % 2 ? 8 : 4)); c.fill(); c.restore(); }
    centred(c, 'EMBERFALL', w * 0.56, h * 0.42, `bold 31px ${FONT_SERIF}`, goldC); centred(c, 'CORE RULES', w * 0.56, h * 0.76, `bold 14px ${FONT_SERIF}`, '#e8c878');
  });
  T.bookBeasts = spine('#17402f', '#0f2a20', (c, w, h) => {
    c.strokeStyle = '#c9b074'; c.lineWidth = 1.5; c.strokeRect(10, 9, w - 20, h - 18);
    centred(c, 'BEASTS OF', w * 0.4, h * 0.35, `bold 19px ${FONT_SERIF}`, '#efe4c0'); centred(c, 'THE WILDERLANDS', w * 0.4, h * 0.7, `bold 19px ${FONT_SERIF}`, '#efe4c0');
    c.strokeStyle = '#c9b074'; c.lineWidth = 2; c.beginPath(); c.moveTo(w - 92, h * 0.8); c.quadraticCurveTo(w - 80, h * 0.2, w - 56, h * 0.45); c.quadraticCurveTo(w - 44, h * 0.15, w - 24, h * 0.3); c.quadraticCurveTo(w - 36, h * 0.5, w - 30, h * 0.8); c.moveTo(w - 56, h * 0.45); c.lineTo(w - 62, h * 0.8); c.stroke();   // a dragon, in a few lines
    c.fillStyle = '#c9b074'; c.beginPath(); c.arc(w - 28, h * 0.32, 2.2, 0, PI * 2); c.fill();
  });
  T.bookRoads = spine('#26364a', '#18222f', (c, w, h) => {
    c.strokeStyle = '#b8a26a'; c.lineWidth = 1.5; c.strokeRect(10, 9, w - 20, h - 18);
    c.strokeStyle = '#b8a26a'; c.lineWidth = 2; c.beginPath(); c.moveTo(36, h * 0.8); c.lineTo(36, h * 0.4); c.quadraticCurveTo(54, h * 0.1, 72, h * 0.4); c.lineTo(72, h * 0.8); c.moveTo(46, h * 0.8); c.lineTo(54, h * 0.52); c.lineTo(62, h * 0.8); c.stroke();                                // an arch, a road into it
    centred(c, 'THE DEEP ROADS', w * 0.6, h * 0.5, `bold 25px ${FONT_SERIF}`, '#e6d8a8');
  });
  T.pages = A.tile(64, 16, (c, w, h) => { c.fillStyle = '#e9dfc4'; c.fillRect(0, 0, w, h); c.strokeStyle = 'rgba(120,100,60,0.35)'; c.lineWidth = 1; for (let y = 3; y < h - 2; y += 2) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); } c.fillStyle = 'rgba(60,40,20,0.7)'; c.fillRect(0, 0, w, 2); c.fillRect(0, h - 2, w, 2); });
  // the standing paperbacks and hardcovers of the lower bays: one spine tile per colour (a tall label panel and two bands), and a plain cover colour
  const bookCols = ['#7d1f1c', '#1d4a6b', '#c9a43a', '#2d5e3c', '#6a3a78', '#a86a2a', '#2c2c34'];
  T.spines = bookCols.map((col, i) => A.tile(40, 150, (c, w, h) => { c.fillStyle = col; c.fillRect(0, 0, w, h); grain(c, w, h, q, 30, 0.08, '0,0,0', '255,255,255', 5); c.fillStyle = 'rgba(235,215,150,0.85)'; c.fillRect(0, 12, w, 3); c.fillRect(0, h - 15, w, 3); c.fillStyle = 'rgba(240,230,200,0.9)'; c.fillRect(6, 30 + (i % 3) * 8, w - 12, 44); c.fillStyle = 'rgba(40,30,20,0.8)'; for (let k = 0; k < 4; k++) c.fillRect(9, 36 + (i % 3) * 8 + k * 9, w - 18 - (k % 2) * 6, 2); }));
  T.covers = bookCols.map((col) => A.tile(8, 8, (c, w, h) => { c.fillStyle = col; c.fillRect(0, 0, w, h); }));
  T.leather = A.tile(64, 64, (c, w, h) => { c.fillStyle = '#6a4224'; c.fillRect(0, 0, w, h); grain(c, w, h, q, 120, 0.14, '20,8,2', '170,120,70', 4); });
  T.dice = A.tile(32, 32, (c, w, h) => { c.fillStyle = '#e8e8e8'; c.fillRect(0, 0, w, h); c.fillStyle = 'rgba(255,255,255,0.7)'; c.fillRect(2, 2, 12, 5); c.fillStyle = 'rgba(30,20,20,0.85)'; for (const [x, y] of [[9, 9], [23, 9], [9, 23], [23, 23], [16, 16]]) { c.beginPath(); c.arc(x, y, 2.4, 0, PI * 2); c.fill(); } });
  T.chest = A.tile(160, 96, (c, w, h) => {
    woodGrain(c, w, h, q, '#3a2a1c', '10,5,0'); c.fillStyle = '#26262a'; for (const x of [18, w - 30]) { c.fillRect(x, 0, 12, h); c.fillStyle = '#4a4a52'; for (const y of [10, h - 12]) { c.beginPath(); c.arc(x + 6, y, 2.2, 0, PI * 2); c.fill(); } c.fillStyle = '#26262a'; }
    c.fillRect(0, h * 0.4, w, 7); c.fillStyle = '#bf9a3a'; rrect(c, w / 2 - 12, h * 0.34, 24, 26, 3); c.fill(); c.fillStyle = '#1a1208'; c.fillRect(w / 2 - 2, h * 0.44, 4, 10);
  });
  T.vhs = A.tile(96, 56, (c, w, h) => { c.fillStyle = '#17171b'; c.fillRect(0, 0, w, h); c.fillStyle = '#2a2a30'; c.fillRect(4, 4, w - 8, 14); c.fillStyle = '#e6dcc4'; c.fillRect(10, 24, w - 20, 24); c.fillStyle = '#c0392b'; c.fillRect(10, 24, 16, 24); c.fillStyle = '#222'; c.fillRect(32, 30, 48, 3); c.fillRect(32, 38, 36, 3); });
  T.leaf = A.tile(64, 64, (c, w, h) => {                                                                                                         // an ivy leaf (alpha-tested)
    c.clearRect(0, 0, w, h); c.fillStyle = 'rgba(40,90,30,0.004)'; c.fillRect(0, 0, w, h);
    const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#3f8a36'); g.addColorStop(1, '#245a22'); c.fillStyle = g;
    c.beginPath(); c.moveTo(w / 2, 4); c.bezierCurveTo(w * 0.95, h * 0.18, w * 0.98, h * 0.6, w / 2, h - 3); c.bezierCurveTo(w * 0.02, h * 0.6, w * 0.05, h * 0.18, w / 2, 4); c.fill();
    c.strokeStyle = 'rgba(200,230,150,0.55)'; c.lineWidth = 1.3; c.beginPath(); c.moveTo(w / 2, 6); c.lineTo(w / 2, h - 5); for (const y of [0.3, 0.5, 0.7]) { c.moveTo(w / 2, h * y); c.lineTo(w * 0.8, h * (y - 0.12)); c.moveTo(w / 2, h * y); c.lineTo(w * 0.2, h * (y - 0.12)); } c.stroke();
  });
  T.blade = A.tile(48, 192, (c, w, h) => {                                                                                                       // a long broad leaf (alpha-tested)
    c.clearRect(0, 0, w, h); c.fillStyle = 'rgba(40,90,30,0.004)'; c.fillRect(0, 0, w, h);
    const g = c.createLinearGradient(0, 0, w, 0); g.addColorStop(0, '#2c6a2a'); g.addColorStop(0.5, '#3d8a38'); g.addColorStop(1, '#245a24'); c.fillStyle = g;
    c.beginPath(); c.moveTo(w / 2, 2); c.bezierCurveTo(w * 1.05, h * 0.3, w * 0.95, h * 0.8, w / 2, h - 2); c.bezierCurveTo(w * 0.05, h * 0.8, -w * 0.05, h * 0.3, w / 2, 2); c.fill();
    c.strokeStyle = 'rgba(210,235,160,0.5)'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(w / 2, 4); c.lineTo(w / 2, h - 4); c.stroke();
  });
  T.terra = A.tile(64, 64, (c, w, h) => { c.fillStyle = '#b4623a'; c.fillRect(0, 0, w, h); grain(c, w, h, q, 90, 0.12, '60,20,5', '240,170,120', 5); c.fillStyle = 'rgba(0,0,0,0.18)'; c.fillRect(0, 0, w, 8); c.fillStyle = 'rgba(255,200,150,0.18)'; c.fillRect(0, 8, w, 3); });
  T.soil = A.tile(16, 16, (c, w, h) => { c.fillStyle = '#2a1a10'; c.fillRect(0, 0, w, h); grain(c, w, h, q, 30, 0.2, '0,0,0', '110,80,50', 3); });
  return T;
}

// ====================================================================================================== the mesh builder
const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
class MB {
  constructor(bounce) { this.P = []; this.N = []; this.U = []; this.C = []; this.I = []; this.n = 0; this.bounce = bounce; }
  quad(pts, nrm, r, tint = [1, 1, 1], ao = 1) {
    const base = this.n, uv = [[r.u0, r.v1], [r.u1, r.v1], [r.u1, r.v0], [r.u0, r.v0]];
    for (let i = 0; i < 4; i++) {
      const p = pts[i], k = 1 - ao * (1 - (0.5 + 0.5 * smooth(0, 0.5, p[1])));                                 // contact darkening near the floor
      this.P.push(p[0], p[1], p[2]); this.N.push(nrm[0], nrm[1], nrm[2]); this.U.push(uv[i][0], uv[i][1]); this.C.push(tint[0] * k, tint[1] * k, tint[2] * k);
    }
    this.I.push(base, base + 1, base + 2, base, base + 2, base + 3); this.n += 4;
  }
  // an axis box (any rotation by o.rot = [rx, ry, rz]); f: { px, nx, py, ny, pz, nz, side, all } -> atlas rects
  box(cx, cy, cz, sx, sy, sz, f, o = {}) {
    const hx = sx / 2, hy = sy / 2, hz = sz / 2;
    _q.setFromEuler(_e.set(o.rot ? o.rot[0] : 0, o.rot ? o.rot[1] : 0, o.rot ? o.rot[2] : 0, 'YXZ'));
    const T = (p) => { _v.set(p[0], p[1], p[2]).applyQuaternion(_q); return [cx + _v.x, cy + _v.y, cz + _v.z]; };
    const Nn = (p) => { _v.set(p[0], p[1], p[2]).applyQuaternion(_q); return [_v.x, _v.y, _v.z]; };
    const faces = [
      ['pz', [[-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz]], [0, 0, 1]],
      ['nz', [[hx, -hy, -hz], [-hx, -hy, -hz], [-hx, hy, -hz], [hx, hy, -hz]], [0, 0, -1]],
      ['px', [[hx, -hy, hz], [hx, -hy, -hz], [hx, hy, -hz], [hx, hy, hz]], [1, 0, 0]],
      ['nx', [[-hx, -hy, -hz], [-hx, -hy, hz], [-hx, hy, hz], [-hx, hy, -hz]], [-1, 0, 0]],
      ['py', [[-hx, hy, hz], [hx, hy, hz], [hx, hy, -hz], [-hx, hy, -hz]], [0, 1, 0]],
      ['ny', [[-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz], [-hx, -hy, hz]], [0, -1, 0]],
    ];
    for (const [k, pts, n] of faces) {
      let r = f[k] || (k !== 'py' && k !== 'ny' ? f.side : null) || f.all;
      if (k === 'ny' && !f.ny && !o.bottom) continue;
      if (!r) continue;
      this.quad(pts.map(T), Nn(n), r, o.tint, o.ao ?? 1);
    }
  }
  // an upright (optionally tapered) cylinder; the seam sits at angle th0 (0 = +z), the tile runs once around, top cap optional
  cyl(cx, y0, cz, rt, rb, h, seg, side, cap, o = {}) {
    const th0 = o.th0 || 0, kz = o.kz || 1, tint = o.tint || [1, 1, 1], slope = (rb - rt) / h;
    const base = this.n;
    for (let i = 0; i <= seg; i++) {
      const th = th0 + i / seg * PI * 2, sx = Math.sin(th), cz_ = Math.cos(th), u = side.u0 + i / seg * (side.u1 - side.u0);
      const nl = Math.hypot(1, slope), nn = [sx / nl, slope / nl, cz_ * kz / nl];
      for (const [rr, y, v] of [[rb, y0, side.v1], [rt, y0 + h, side.v0]]) {
        const k = 1 - (o.ao ?? 1) * (1 - (0.5 + 0.5 * smooth(0, 0.5, y)));
        this.P.push(cx + sx * rr, y, cz + cz_ * rr * kz); this.N.push(nn[0], nn[1], nn[2]); this.U.push(u, v); this.C.push(tint[0] * k, tint[1] * k, tint[2] * k);
      }
    }
    for (let i = 0; i < seg; i++) { const a = base + i * 2; this.I.push(a, a + 2, a + 3, a, a + 3, a + 1); }
    this.n += (seg + 1) * 2;
    if (cap && rt > 0) {
      const cb = this.n, yy = y0 + h, k = 1 - (o.ao ?? 1) * (1 - (0.5 + 0.5 * smooth(0, 0.5, yy)));
      const cu = (cap.u0 + cap.u1) / 2, cv = (cap.v0 + cap.v1) / 2, hu = (cap.u1 - cap.u0) / 2, hv = (cap.v1 - cap.v0) / 2;
      this.P.push(cx, yy, cz); this.N.push(0, 1, 0); this.U.push(cu, cv); this.C.push(tint[0] * k, tint[1] * k, tint[2] * k);
      for (let i = 0; i <= seg; i++) {
        const th = th0 + i / seg * PI * 2, sx = Math.sin(th), cz_ = Math.cos(th);
        this.P.push(cx + sx * rt, yy, cz + cz_ * rt * kz); this.N.push(0, 1, 0); this.U.push(cu + sx * hu, cv - cz_ * hv); this.C.push(tint[0] * k, tint[1] * k, tint[2] * k);
      }
      for (let i = 0; i < seg; i++) this.I.push(cb, cb + 1 + i, cb + 2 + i);
      this.n += seg + 2;
    }
  }
  // a flat ellipse lying on the floor (a rug), the tile mapped across it
  disc(cx, y, cz, rx, rz, seg, r, o = {}) {
    const tint = o.tint || [1, 1, 1], base = this.n; this.P.push(cx, y, cz); this.N.push(0, 1, 0); this.U.push((r.u0 + r.u1) / 2, (r.v0 + r.v1) / 2); this.C.push(...tint);
    for (let i = 0; i <= seg; i++) {
      const th = i / seg * PI * 2, sx = Math.sin(th), cz_ = Math.cos(th);
      this.P.push(cx + sx * rx, y, cz + cz_ * rz); this.N.push(0, 1, 0); this.U.push(r.u0 + (0.5 + sx * 0.5) * (r.u1 - r.u0), r.v0 + (0.5 + cz_ * 0.5) * (r.v1 - r.v0)); this.C.push(...tint);
    }
    for (let i = 0; i < seg; i++) this.I.push(base, base + 1 + i, base + 2 + i);
    this.n += seg + 2;
  }
  // a flat rectangle lying on the floor (the striped rug)
  flat(cx, y, cz, w, d, r, o = {}) {
    const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2;
    this.quad([[x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0]], [0, 1, 0], r, o.tint || [1, 1, 1], 0);
  }
  // a squashed sphere with a flat bottom (a bean bag, a lump of laundry)
  blob(cx, cy, cz, rx, ry, rz, nLat, nLon, r, o = {}) {
    const tint = o.tint || [1, 1, 1], base = this.n, bot = o.bottom ?? 0.4;
    for (let j = 0; j <= nLat; j++) {
      const ph = j / nLat * PI, sp = Math.sin(ph), cp = Math.cos(ph);
      for (let i = 0; i <= nLon; i++) {
        const th = i / nLon * PI * 2, sx = Math.sin(th), cz_ = Math.cos(th);
        let y = ry * cp; if (y < 0) y *= bot;
        const lump = 1 + (o.lump || 0) * Math.sin(th * 3 + ph * 2) * sp;
        const x = rx * sp * sx * lump, z = rz * sp * cz_ * lump;
        const n = [x / (rx * rx), (y < 0 ? y / (ry * ry * bot * bot) : y / (ry * ry)), z / (rz * rz)], nl = Math.hypot(...n) || 1;
        const k = 1 - (o.ao ?? 1) * (1 - (0.5 + 0.5 * smooth(0, 0.4, cy + y)));
        this.P.push(cx + x, cy + y, cz + z); this.N.push(n[0] / nl, n[1] / nl, n[2] / nl);
        this.U.push(r.u0 + i / nLon * (r.u1 - r.u0), r.v0 + j / nLat * (r.v1 - r.v0)); this.C.push(tint[0] * k, tint[1] * k, tint[2] * k);
      }
    }
    const row = nLon + 1;
    for (let j = 0; j < nLat; j++) for (let i = 0; i < nLon; i++) { const a = base + j * row + i; this.I.push(a, a + row, a + row + 1, a, a + row + 1, a + 1); }
    this.n += (nLat + 1) * row;
  }
  // a thin rod between two points (a clothesline, a chain, a pipe run): a 4-sided prism
  rod(a, b, w, r, o = {}) {
    const d = _v.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]), len = d.length(); if (len < 1e-5) return;
    const t = d.clone().divideScalar(len), up = Math.abs(t.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const s = new THREE.Vector3().crossVectors(t, up).normalize().multiplyScalar(w / 2), u = new THREE.Vector3().crossVectors(s, t).normalize().multiplyScalar(w / 2);
    const corner = [[1, 1], [-1, 1], [-1, -1], [1, -1]].map(([x, y]) => [s.x * x + u.x * y, s.y * x + u.y * y, s.z * x + u.z * y]);
    for (let i = 0; i < 4; i++) {
      const c0 = corner[i], c1 = corner[(i + 1) % 4], nn = [(c0[0] + c1[0]) / 2, (c0[1] + c1[1]) / 2, (c0[2] + c1[2]) / 2], nl = Math.hypot(...nn) || 1;
      this.quad([[a[0] + c0[0], a[1] + c0[1], a[2] + c0[2]], [b[0] + c0[0], b[1] + c0[1], b[2] + c0[2]], [b[0] + c1[0], b[1] + c1[1], b[2] + c1[2]], [a[0] + c1[0], a[1] + c1[1], a[2] + c1[2]]],
        [nn[0] / nl, nn[1] / nl, nn[2] / nl], r, o.tint, o.ao ?? 1);
    }
  }
  // a strip of cloth hung between columns of edge points (the pennant): cols = [{ a: top [x,y,z], b: bottom, n: normal, ua: [u,v], ub: [u,v] }], left to right, seen from +z
  ribbon(cols, tint = [1, 1, 1]) {
    const base = this.n;
    for (const c of cols) for (const [p, uv] of [[c.a, c.ua], [c.b, c.ub]]) { this.P.push(p[0], p[1], p[2]); this.N.push(c.n[0], c.n[1], c.n[2]); this.U.push(uv[0], uv[1]); this.C.push(tint[0], tint[1], tint[2]); }
    for (let i = 0; i < cols.length - 1; i++) { const a = base + i * 2; this.I.push(a + 1, a + 3, a + 2, a + 1, a + 2, a); }
    this.n += cols.length * 2;
  }
  geometry() {
    const g = new THREE.BufferGeometry(), n = this.n, B = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const b = this.bounce ? this.bounce(this.P[i * 3], this.P[i * 3 + 1], this.P[i * 3 + 2]) : [0.27, 0.27, 0.27];
      B[i * 3] = b[0] * PI; B[i * 3 + 1] = b[1] * PI; B[i * 3 + 2] = b[2] * PI;
    }
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(this.N, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.U, 2)); g.setAttribute('uv1', new THREE.Float32BufferAttribute(this.U, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.C, 3)); g.setAttribute('bounce', new THREE.BufferAttribute(B, 3));
    g.setIndex(n > 65535 ? new THREE.Uint32BufferAttribute(this.I, 1) : new THREE.Uint16BufferAttribute(this.I, 1));
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
}

// the baked bounce at a spot goes in as the ambient term (the same number a lightmapped surface there would get), on top of the room's real lights
function withBounce(mat) {
  mat.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 bounce;\nvarying vec3 vBounce;').replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvBounce = bounce;');
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vBounce;')
      .replace('#include <lights_fragment_maps>', '#include <lights_fragment_maps>\n#if defined( RE_IndirectDiffuse )\n\tirradiance += vBounce;\n#endif');
  };
  mat.customProgramCacheKey = () => 'basementprops-bounce';
  return mat;
}

// ====================================================================================================== the room
export function buildBasementProps(o = {}) {
  const r = rng(1982);
  const atlas = new Atlas(2048);
  const T = paintAtlas(atlas, r);
  const tex = new THREE.CanvasTexture(atlas.cv);
  tex.flipY = false; tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = o.anisotropy || 4; tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.needsUpdate = true;
  const bounceAt = o.bounceAt || null;
  const M = new MB(bounceAt), MM = new MB(bounceAt), CL = new MB(bounceAt), GL = new MB(null), NC = new MB(bounceAt);       // lit atlas mesh, metals, cloth, glowing bulbs, and the pieces that do not cast the lamp's shadow
  const colliders = [], shadows = [], lights = {};
  const hit = (name, cx, cy, cz, hx, hy, hz) => colliders.push({ kind: 'box', name: 'prop:' + name, trigger: false, on: true, c: [cx, cy, cz], he: [hx, hy, hz] });
  const sh = (x, z, w, d, k = 1, rot = 0) => shadows.push({ x, z, w, d, k, rot });
  const bulbs = [];
  const WARM = col(0xffe2a8);
  const bulb = (name, x, y, z, I, range, tint = [1, 0.86, 0.62]) => {
    // a bare bulb on a cord from the ceiling: the glowing glass, the socket, the cord, and the point light it stands for
    GL.cyl(x, y - 0.045, z, 0.04, 0.032, 0.09, 12, T.bulb, T.bulb, { tint: [3.2, 2.7, 1.9] });
    M.cyl(x, y + 0.045, z, 0.026, 0.026, 0.06, 10, T.iron, T.iron);
    M.rod([x, y + 0.1, z], [x, 3.0, z], 0.012, T.iron, { tint: [0.2, 0.2, 0.2], ao: 0 });
    bulbs.push({ name, pos: [x, y - 0.03, z], I, range, tint });
  };

  // ------------------------------------------------------------------------------------------ WORKSHOP (north wall, west end)
  {
    const x0 = -7.5, x1 = -4.3, cx = (x0 + x1) / 2, bw = x1 - x0, zb = -6.66;
    M.box(cx, 0.895, zb, bw, 0.05, 0.62, { py: T.benchTop, side: T.wood, ny: T.wood });
    for (const [lx, lz] of [[x0 + 0.05, -6.42], [x1 - 0.05, -6.42], [x0 + 0.05, -6.92], [x1 - 0.05, -6.92]]) M.box(lx, 0.435, lz, 0.07, 0.87, 0.07, { all: T.wood });
    M.box(cx, 0.8, -6.40, bw - 0.1, 0.1, 0.03, { all: T.wood });
    M.box(cx, 0.2, zb, bw - 0.1, 0.025, 0.56, { py: T.plywood, side: T.wood });
    M.box(-6.85, 0.33, -6.66, 0.5, 0.22, 0.24, { all: T.redTool }); M.box(-6.85, 0.46, -6.66, 0.26, 0.04, 0.05, { all: T.iron });                // a toolbox on the lower shelf
    M.cyl(-4.75, 0.2125, -6.62, 0.15, 0.12, 0.3, 14, T.steel, T.iron, { tint: [0.9, 0.9, 0.9] });                                                  // a bucket
    M.box(-5.7, 0.31, -6.66, 0.4, 0.2, 0.34, { side: T.card, py: T.cardTop });
    // on the bench: a vise, a can of screws, a jar of nails, a drill, a coffee can's lid, a hammer left lying
    MM.box(-7.2, 0.97, -6.7, 0.2, 0.1, 0.2, { all: T.iron }); MM.box(-7.2, 1.03, -6.6, 0.16, 0.08, 0.05, { all: T.iron }); MM.box(-7.2, 1.03, -6.54, 0.1, 0.07, 0.03, { all: T.steel });
    MM.rod([-7.31, 1.02, -6.5], [-7.09, 1.02, -6.5], 0.02, T.steel); MM.rod([-7.3, 1.02, -6.5], [-7.3, 1.1, -6.5], 0.018, T.steel);
    M.cyl(-6.45, 0.92, -6.68, 0.075, 0.075, 0.16, 16, T.coffee, T.screws, { th0: PI });
    M.cyl(-6.2, 0.92, -6.72, 0.04, 0.04, 0.12, 12, T.jarNails, T.canTop, { th0: PI });
    M.box(-5.55, 0.97, -6.62, 0.2, 0.09, 0.07, { all: T.iron }, { rot: [0, 0.35, 0] });
    M.box(-5.15, 0.985, -6.6, 0.09, 0.12, 0.05, { all: T.iron }, { rot: [0, -0.2, 0] });
    M.box(-4.7, 0.925, -6.5, 0.28, 0.025, 0.035, { all: T.wood }, { rot: [0, 0.5, 0] }); M.box(-4.62, 0.935, -6.47, 0.09, 0.045, 0.03, { all: T.iron }, { rot: [0, 0.5, 0] });
    sh(cx, -6.62, bw + 0.2, 0.9, 1.0);
    hit('bench', cx, 0.46, zb, bw / 2, 0.46, 0.31);
    // the stool
    M.cyl(-5.35, 0.5, -5.78, 0.19, 0.19, 0.05, 14, T.wood, T.plywood); for (let i = 0; i < 3; i++) { const a = i / 3 * PI * 2 + 0.4; M.rod([-5.35 + Math.sin(a) * 0.15, 0, -5.78 + Math.cos(a) * 0.15], [-5.35 + Math.sin(a) * 0.12, 0.5, -5.78 + Math.cos(a) * 0.12], 0.03, T.wood); }
    sh(-5.35, -5.78, 0.5, 0.5, 0.8); hit('stool', -5.35, 0.27, -5.78, 0.19, 0.27, 0.19);
    // the pegboard and the hardware hung on it
    M.box(cx - 0.05, 1.6, -6.985, 3.0, 0.97, 0.02, { pz: T.pegboard, side: T.wood });
    // relief pieces over the painted tools, registered to the tile (768 x 248 px over 3.0 x 0.97 m)
    const pegX = (px) => cx - 0.05 - 1.5 + px / 768 * 3.0, pegY = (py) => 1.6 + 0.485 - py / 248 * 0.97, pz = -6.945;
    MM.box(pegX(58.5), pegY(48 + 43), pz, 0.037, 0.335, 0.02, { all: T.wood }); MM.box(pegX(58), pegY(49), pz, 0.17, 0.06, 0.03, { all: T.steel }); MM.box(pegX(40), pegY(40), pz, 0.07, 0.04, 0.028, { all: T.steel }, { rot: [0, 0, 0.5] });   // the hammer
    MM.box(pegX(475), pegY(53), pz, 0.74, 0.17, 0.005, { all: T.steel }); MM.box(pegX(362), pegY(53), pz, 0.18, 0.24, 0.022, { all: T.wood });                                                                            // the saw
    MM.box(pegX(484), pegY(130), pz, 0.94, 0.078, 0.028, { all: T.white }, { tint: [0.34, 0.45, 0.07] });                                                                                                             // the level
    for (const [px, tn] of [[272.5, [0.5, 0.06, 0.04]], [290.5, [0.65, 0.5, 0.08]], [308.5, [0.06, 0.14, 0.32]]]) MM.box(pegX(px), pegY(52 + 16), pz, 0.05, 0.125, 0.04, { all: T.white }, { tint: tn });                        // screwdriver handles
    MM.box(pegX(595), pegY(118), pz, 0.31, 0.14, 0.05, { all: T.white }, { tint: [0.1, 0.22, 0.4] });                                                                                                                   // the drill
    // the shop light: a long fixture on two chains, its tube glowing
    M.box(-5.9, 2.5, -6.5, 1.3, 0.06, 0.2, { all: T.galv }); GL.box(-5.9, 2.465, -6.5, 1.22, 0.03, 0.06, { all: T.bulb }, { tint: [2.4, 2.35, 2.0] });
    M.rod([-6.45, 2.53, -6.5], [-6.45, 3.0, -6.5], 0.012, T.iron, { tint: [0.4, 0.4, 0.4], ao: 0 }); M.rod([-5.35, 2.53, -6.5], [-5.35, 3.0, -6.5], 0.012, T.iron, { tint: [0.4, 0.4, 0.4], ao: 0 });
    bulbs.push({ name: 'ShopLight', pos: [-5.9, 2.4, -6.25], I: 1.7, range: 6.2, tint: [1.0, 0.93, 0.78] });
    // a poster beside it
    M.box(-8.45, 1.76, -6.985, 0.5, 0.7, 0.01, { pz: T.posterOrchard });
  }

  // ------------------------------------------------------------------------------------------ LAUNDRY (west wall, south of the vintage cabinet)
  {
    M.box(-8.65, 0.43, 4.39, 0.7, 0.86, 0.68, { px: T.washerFront, nz: T.enamel, pz: T.enamel, py: T.washerTop, nx: T.enamel }, { tint: [1.0, 0.98, 0.94] });
    M.box(-8.93, 0.97, 4.39, 0.14, 0.2, 0.68, { px: T.washerPanel, nz: T.enamel, pz: T.enamel, py: T.enamel });
    M.box(-8.65, 0.46, 5.12, 0.7, 0.92, 0.68, { px: T.dryerFront, nz: T.enamel, pz: T.enamel, py: T.enamel });
    M.box(-8.93, 1.02, 5.12, 0.14, 0.2, 0.68, { px: T.dryerPanel, nz: T.enamel, pz: T.enamel, py: T.enamel });
    M.box(-8.72, 1.0, 4.2, 0.2, 0.28, 0.12, { nx: T.detergent, px: T.detergent, nz: T.detergent, pz: T.detergent, py: T.detergent }, { rot: [0, 0.4, 0] });
    sh(-8.65, 4.76, 0.9, 1.7, 1.0); hit('washer_dryer', -8.65, 0.5, 4.76, 0.35, 0.5, 0.71);
    // the basket, with a heap of wash in it
    const bx = -7.7, bz = 4.5;
    M.box(bx, 0.03, bz, 0.5, 0.03, 0.4, { all: T.wicker }, { rot: [0, 0.3, 0] });
    for (const [dx, dz, w, d] of [[0.25, 0, 0.03, 0.4], [-0.25, 0, 0.03, 0.4], [0, 0.2, 0.5, 0.03], [0, -0.2, 0.5, 0.03]]) {
      const ca = Math.cos(0.3), sa = Math.sin(0.3);
      M.box(bx + dx * ca + dz * sa, 0.2, bz - dx * sa + dz * ca, w, 0.33, d, { all: T.wicker }, { rot: [0, 0.3, 0] });
    }
    CL.blob(bx, 0.34, bz, 0.22, 0.11, 0.18, 8, 12, T.towel, { lump: 0.12, bottom: 0.5 });
    sh(bx, bz, 0.62, 0.52, 0.9, 0.3); hit('basket', bx, 0.18, bz, 0.27, 0.18, 0.24);
    // the clothesline, from a hook in the west wall to one in the south wall, with the week's wash on it
    const A_ = [-8.96, 2.14, 4.1], B_ = [-5.1, 2.14, 6.96], sag = 0.2, at = (t) => [A_[0] + (B_[0] - A_[0]) * t, A_[1] + (B_[1] - A_[1]) * t - sag * 4 * t * (1 - t), A_[2] + (B_[2] - A_[2]) * t];
    for (let i = 0; i < 14; i++) M.rod(at(i / 14), at((i + 1) / 14), 0.008, T.white, { tint: [0.75, 0.72, 0.62], ao: 0 });
    M.box(-8.94, 2.14, 4.1, 0.05, 0.03, 0.03, { all: T.iron }); M.box(-5.1, 2.14, 6.95, 0.03, 0.03, 0.05, { all: T.iron });
    const ang = Math.atan2(B_[0] - A_[0], B_[2] - A_[2]);                       // the line's direction in the floor plane
    const hang = (t, w, h, rect, off = 0) => {
      const p = at(t), sx = Math.sin(ang), sz = Math.cos(ang);
      const pts = [[p[0] - sx * w / 2, p[1] - h, p[2] - sz * w / 2], [p[0] + sx * w / 2, p[1] - h, p[2] + sz * w / 2], [p[0] + sx * w / 2, p[1] + 0.02, p[2] + sz * w / 2], [p[0] - sx * w / 2, p[1] + 0.02, p[2] - sz * w / 2]];
      const nrm = [-sz, 0, sx]; const bend = off;
      pts[0][0] += nrm[0] * bend; pts[0][2] += nrm[2] * bend; pts[1][0] += nrm[0] * bend; pts[1][2] += nrm[2] * bend;
      CL.quad(pts, nrm, rect, [1, 1, 1], 0);
    };
    hang(0.16, 0.34, 0.62, T.towel); hang(0.31, 0.38, 0.56, T.jeans, 0.03); hang(0.47, 0.36, 0.44, T.shirt, -0.02); hang(0.6, 0.2, 0.28, T.socks); hang(0.67, 0.2, 0.28, T.socks, 0.02); hang(0.8, 0.4, 0.46, T.shirt, 0.02);
    bulb('LaundryBulb', -7.55, 2.52, 4.55, 1.5, 5.5);
    M.box(-8.985, 2.0, 5.9, 0.01, 0.62, 0.46, { px: T.posterGopher });
  }

  // ------------------------------------------------------------------------------------------ UTILITY WALL (south wall): shelves, boxes, furnace, water heater
  {
    // the steel shelving, loaded
    const sx0 = -6.55, sx1 = -5.15, scx = (sx0 + sx1) / 2, sz0 = 6.45, sz1 = 6.98, scz = (sz0 + sz1) / 2, sw = sx1 - sx0, sd = sz1 - sz0;
    for (const [px, pz] of [[sx0 + 0.02, sz0 + 0.02], [sx1 - 0.02, sz0 + 0.02], [sx0 + 0.02, sz1 - 0.02], [sx1 - 0.02, sz1 - 0.02]]) M.box(px, 0.925, pz, 0.035, 1.85, 0.035, { all: T.steel });
    const ys = [0.1, 0.55, 0.98, 1.4, 1.83];
    for (const y of ys) M.box(scx, y, scz, sw, 0.022, sd, { py: T.shelfTop, side: T.steel }, { bottom: y > 1.6 });
    // lowest shelf: cartons and a bucket
    M.box(-6.25, 0.27, 6.7, 0.42, 0.3, 0.38, { side: T.card, py: T.cardTop }, { rot: [0, 0.05, 0] }); M.box(-5.7, 0.27, 6.72, 0.4, 0.3, 0.38, { nz: T.label[2], side: T.card, py: T.cardTop }, { rot: [0, -0.04, 0] });
    M.cyl(-5.32, 0.121, 6.75, 0.1, 0.085, 0.23, 14, T.steel, T.iron, { tint: [0.7, 0.8, 0.6] });
    // the paint: cans in two rows, a few lids stacked
    const cans = [T.canRed, T.canBlue, T.canCream, T.canGreen, T.canCream, T.canRed];
    cans.forEach((t, i) => M.cyl(-6.42 + i * 0.2, 0.561, 6.58, 0.085, 0.085, 0.2, 14, t, T.canTop, { th0: PI + (r() - 0.5) * 0.6 }));
    [T.canCream, T.canRed, T.canBlue, T.canCream].forEach((t, i) => M.cyl(-6.34 + i * 0.22, 0.561, 6.84, 0.085, 0.085, 0.2, 14, t, T.canTop, { th0: PI + (r() - 0.5) * 0.8 }));
    M.cyl(-5.38, 0.571, 6.6, 0.085, 0.085, 0.045, 14, T.canTop, T.canTop); M.cyl(-5.38, 0.616, 6.6, 0.085, 0.085, 0.045, 14, T.canTop, T.canTop);
    // jars of nails and screws, spray cans
    const jars = [T.jarNails, T.jarScrews, T.jarGreen, T.jarNails, T.jarHoney, T.jarScrews, T.jarNails];
    jars.forEach((t, i) => M.cyl(-6.45 + i * 0.12, 0.992, 6.6 + (i % 2) * 0.12, 0.045, 0.045, 0.13, 12, t, T.canTop, { th0: PI }));
    [0, 1, 2].forEach((i) => M.cyl(-5.45 + i * 0.07, 0.992, 6.82, 0.032, 0.032, 0.19, 10, T.spray, T.canTop, { th0: PI }));
    M.box(-6.3, 1.06, 6.85, 0.4, 0.14, 0.14, { all: T.card }, { rot: [0, 0.08, 0] });
    // shoeboxes, a flashlight, the top shelf
    M.box(-6.3, 1.53, 6.72, 0.33, 0.2, 0.2, { side: T.card, py: T.cardTop }); M.box(-5.95, 1.52, 6.7, 0.3, 0.18, 0.2, { side: T.card, py: T.cardTop }, { rot: [0, 0.1, 0] }); M.box(-5.55, 1.5, 6.74, 0.3, 0.16, 0.22, { side: T.card, py: T.cardTop });
    MM.box(-5.3, 1.43, 6.6, 0.18, 0.04, 0.04, { all: T.redTool });
    M.box(-6.0, 1.95, 6.74, 0.55, 0.2, 0.3, { nz: T.label[0], side: T.card, py: T.cardTop }); M.box(-5.5, 1.98, 6.78, 0.22, 0.26, 0.2, { side: T.card, py: T.cardTop });
    sh(scx, scz - 0.1, sw + 0.15, sd + 0.3, 1.0); hit('shelf', scx, 0.93, scz, sw / 2, 0.93, sd / 2);
    // moving boxes
    const carton = (cx, y0, cz, w, h, d, lab, ry) => M.box(cx, y0 + h / 2, cz, w, h, d, { nz: lab, side: T.card, py: T.cardTop }, { rot: [0, ry, 0] });
    carton(-4.25, 0, 6.7, 0.62, 0.46, 0.5, T.label[5], 0.03); carton(-4.25, 0.46, 6.7, 0.58, 0.42, 0.48, T.label[1], -0.07); carton(-4.23, 0.88, 6.72, 0.48, 0.3, 0.4, T.label[3], 0.1);
    carton(-3.45, 0, 6.68, 0.52, 0.4, 0.44, T.label[0], -0.03); carton(-3.45, 0.4, 6.69, 0.42, 0.3, 0.36, T.label[4], 0.12);
    sh(-3.85, 6.68, 1.5, 0.75, 1.0); hit('boxes_a', -4.25, 0.55, 6.7, 0.32, 0.55, 0.26); hit('boxes_b', -3.45, 0.35, 6.68, 0.27, 0.35, 0.23);
    M.box(-3.9, 1.8, 6.985, 0.6, 0.85, 0.01, { nz: T.posterMoon });
    // the furnace, with its plenum and the trunk duct running along the south wall just under the ceiling
    const fx = -2.42, fz = 6.6;
    M.box(fx, 0.62, fz, 0.95, 1.24, 0.76, { nz: T.furnace, side: T.galv, py: T.galv }, { tint: [0.9, 0.95, 0.92] });
    M.box(fx, 1.39, fz + 0.02, 0.8, 0.3, 0.6, { all: T.galv }); MM.box(fx, 2.15, fz + 0.04, 0.5, 1.2, 0.4, { all: T.galv });
    MM.box(-4.7, 2.72, fz + 0.1, 5.6, 0.3, 0.38, { all: T.galv }); MM.box(-1.9, 2.72, fz + 0.1, 0.9, 0.3, 0.38, { all: T.galv });
    for (const x of [-6.1, -4.3, -3.15]) { MM.box(x, 2.72, fz + 0.1, 0.04, 0.34, 0.42, { all: T.galv }, { tint: [0.7, 0.7, 0.7] }); }
    GL.box(fx - 0.22, 0.27, fz - 0.388, 0.09, 0.05, 0.012, { all: T.bulb }, { tint: [3.0, 1.1, 0.25] });                  // the pilot window, a small orange glow
    sh(fx, fz - 0.05, 1.2, 1.05, 1.0); hit('furnace', fx, 0.78, fz, 0.48, 0.78, 0.39);
    // the water heater, flue and the two copper lines
    const hx = -1.45, hz = 6.62;
    M.cyl(hx, 0, hz, 0.27, 0.27, 1.35, 22, T.heater, T.cap, { th0: 0 }); M.cyl(hx, 1.35, hz, 0.22, 0.27, 0.06, 22, T.cap, T.cap);
    MM.cyl(hx, 1.41, hz, 0.055, 0.055, 1.59, 10, T.galv, T.galv); MM.box(hx + 0.2, 1.0, hz - 0.22, 0.06, 0.06, 0.05, { all: T.copper }); MM.cyl(hx + 0.3, 0.0, hz - 0.14, 0.03, 0.03, 0.1, 8, T.copper, T.copper);
    MM.cyl(hx - 0.12, 1.41, hz + 0.1, 0.014, 0.014, 1.59, 8, T.copper, T.copper); MM.cyl(hx + 0.12, 1.41, hz + 0.1, 0.014, 0.014, 1.59, 8, T.copper, T.copper);
    MM.cyl(fx + 0.28, 1.54, fz + 0.1, 0.075, 0.075, 1.46, 10, T.galv, T.galv);
    sh(hx, hz - 0.02, 0.8, 0.8, 1.0, 0); hit('heater', hx, 0.7, hz, 0.28, 0.7, 0.28);
    // a drain in the floor and a bucket of sand beside the heater
    M.box(-0.82, 0.007, 6.2, 0.26, 0.004, 0.26, { py: T.iron }, { ao: 0 });
    M.box(-0.45, 1.75, 6.985, 0.5, 0.72, 0.01, { nz: T.posterLizard });
    bulb('UtilityBulb', -3.95, 2.5, 5.9, 1.9, 6.2);
  }

  // ------------------------------------------------------------------------------------------ EAST WALL: the record corner, darts, storage
  {
    // the stereo console, speakers, records
    const ex = 8.76, cz = -3.2;
    M.box(ex, 0.35, cz, 0.44, 0.7, 1.1, { nx: T.consoleFront, side: T.woodDark, py: T.woodDark });
    M.box(ex, 0.72, cz, 0.48, 0.04, 1.14, { all: T.woodDark }); M.box(ex, 0.8, cz, 0.38, 0.1, 0.44, { all: T.iron }, { tint: [0.35, 0.35, 0.38] });
    M.cyl(ex, 0.85, cz - 0.04, 0.15, 0.15, 0.008, 22, T.vinyl, T.vinyl);
    MM.box(ex + 0.1, 0.87, cz + 0.17, 0.02, 0.012, 0.22, { all: T.steel }, { rot: [0, 0.35, 0] });
    M.box(ex - 0.12, 0.91, cz + 0.46, 0.012, 0.28, 0.3, { all: T.sleeves[0] }, { rot: [0, 0, -0.15] });
    M.box(ex + 0.02, 0.31, cz - 0.97, 0.32, 0.62, 0.34, { nx: T.speaker, side: T.woodDark, py: T.woodDark }); M.box(ex + 0.02, 0.31, cz + 0.97, 0.32, 0.62, 0.34, { nx: T.speaker, side: T.woodDark, py: T.woodDark });
    sh(ex - 0.05, cz, 0.7, 3.0, 0.9); hit('console', ex, 0.37, cz, 0.24, 0.37, 0.57); hit('speaker_a', ex + 0.02, 0.31, cz - 0.97, 0.16, 0.31, 0.17); hit('speaker_b', ex + 0.02, 0.31, cz + 0.97, 0.16, 0.31, 0.17);
    // the record crate
    M.box(8.45, 0.16, -1.95, 0.36, 0.32, 0.4, { nx: T.crate, px: T.crate, nz: T.crate, pz: T.crate, py: T.recEdges }); sh(8.45, -1.95, 0.52, 0.56, 0.9); hit('crate', 8.45, 0.17, -1.95, 0.18, 0.17, 0.2);
    // posters over the console
    M.box(8.985, 1.72, -3.62, 0.01, 0.85, 0.6, { nx: T.posterBand }); M.box(8.985, 1.74, -2.62, 0.01, 0.82, 0.58, { nx: T.posterTape });
    // the bean bag and the braided rug
    M.disc(7.15, 0.012, -0.8, 1.6, 1.15, 40, T.rugBraid, { tint: [1.0, 0.95, 0.9] });
    M.blob(7.66, 0.0, -1.05, 0.58, 0.3, 0.52, 14, 22, T.bean, { lump: 0.1, bottom: 0.04, tint: [1.18, 1.05, 0.9] });                                 // the slumped seat
    M.blob(8.0, 0.0, -1.12, 0.34, 0.5, 0.46, 12, 18, T.bean, { lump: 0.1, bottom: 0.04, tint: [1.18, 1.05, 0.9] });                                  // and its high back against the wall
    sh(7.78, -1.08, 1.4, 1.3, 0.85); hit('beanbag', 7.8, 0.28, -1.08, 0.5, 0.28, 0.46);
    // the dartboard and its line
    M.box(8.96, 1.72, 1.45, 0.04, 0.62, 0.62, { nx: T.dartboard, side: T.woodDark });
    for (const [dy, dz, tl] of [[0.07, 0.04, 0.0], [-0.05, 0.09, 0.0], [0.13, -0.06, 0.0]]) MM.box(8.89, 1.72 + dy, 1.45 + dz, 0.12, 0.012, 0.012, { all: T.redTool });
    M.box(6.62, 0.006, 1.45, 0.06, 0.003, 0.9, { py: T.tape }, { ao: 0, tint: [0.9, 0.88, 0.8] });
    // a skateboard against the wall
    const lean = -0.26, ax = [Math.sin(-lean), Math.cos(lean)], nx_ = [Math.cos(lean), Math.sin(lean)];   // along the deck, and out of its underside (toward the wall)
    M.box(8.82, 0.4, 2.55, 0.025, 0.8, 0.2, { nx: T.skate, side: T.iron, px: T.iron }, { rot: [0, 0, lean], tint: [1.05, 1.0, 0.95] });
    for (const t of [-0.27, 0.27]) {
      const bx0 = 8.82 + ax[0] * t, by0 = 0.4 + ax[1] * t;
      MM.box(bx0 + nx_[0] * 0.035, by0 + nx_[1] * 0.035, 2.55, 0.03, 0.05, 0.17, { all: T.steel }, { rot: [0, 0, lean] });
      for (const dz of [-0.1, 0.1]) M.box(bx0 + nx_[0] * 0.06, by0 + nx_[1] * 0.06, 2.55 + dz, 0.05, 0.055, 0.04, { all: T.skateWheel }, { rot: [0, 0, lean] });
    }
    sh(8.78, 2.55, 0.35, 0.5, 0.8);
    // storage: the tall tree carton and a stack of moving boxes
    M.box(8.74, 0.62, 3.7, 0.3, 1.24, 0.34, { nx: T.tree, side: T.card, py: T.cardTop }, { rot: [0, 0.03, 0] }); sh(8.74, 3.7, 0.6, 0.6, 1.0); hit('tree_box', 8.74, 0.62, 3.7, 0.16, 0.62, 0.18);
    const cartonE = (cz, y0, w, h, d, lab, ry) => M.box(8.97 - d / 2, y0 + h / 2, cz, d, h, w, { nx: lab, side: T.card, py: T.cardTop }, { rot: [0, ry, 0] });
    cartonE(4.6, 0, 0.7, 0.46, 0.56, T.label[7], 0.02); cartonE(4.58, 0.46, 0.62, 0.4, 0.5, T.label[6], -0.06); cartonE(4.62, 0.86, 0.54, 0.34, 0.44, T.label[5], 0.09);
    cartonE(5.12, 0, 0.5, 0.36, 0.5, T.label[1], -0.04);
    sh(8.65, 4.85, 0.9, 1.5, 1.0); hit('boxes_e', 8.7, 0.6, 4.6, 0.3, 0.6, 0.36); hit('boxes_e2', 8.72, 0.18, 5.12, 0.26, 0.18, 0.26);
    M.box(8.985, 1.6, 3.0, 0.01, 0.7, 0.5, { nx: T.posterRoller });
    bulb('EastBulb', 7.7, 2.5, 0.35, 1.7, 6.0, [1.0, 0.82, 0.55]);
    // the second rug, in front of the couch
    M.flat(0.1, 0.011, -2.45, 2.6, 1.76, T.rugStripe);
  }

  // ------------------------------------------------------------------------------------------ THE WAKE WALL (north wall, around the TV: the first thing the player sees)
  // Laid out from the concept art (01_basement_finished): the STARVECTOR poster over the TV's left half, a dark red pennant across the middle, the car poster
  // (the room's own) and a taped note under it, a bookshelf at the right with the three big rule books, a dice pouch, a small chest and an ivy trailing over
  // the top, a potted plant at the far left. The TV, the VCR, the car poster, the lamp, the box and the can are the room's own and stay where they are.
  {
    const WZ = -6.985, q2 = rng(77);
    M.box(-1.68, 2.045, WZ, 0.62, 0.91, 0.01, { pz: T.posterStar });                                                                                  // the poster (the car poster beside the note is 0.62 x 0.91 too)
    for (const [dx, dy] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) MM.box(-1.68 + dx * 0.29, 2.045 + dy * 0.43, WZ + 0.008, 0.012, 0.012, 0.008, { all: T.iron }, { tint: [1.6, 1.3, 0.6], ao: 0 });
    // the pennant: a ribbon of felt, pinned at its top and bottom corners, hanging with a slow wave
    {
      const x0 = -0.45, x1 = 0.74, yt = 2.33, yb = 1.7, ym = 2.015, N = 14, cols = [], rect = T.pennant;
      for (let i = 0; i <= N; i++) {
        const f = i / N, x = x0 + (x1 - x0) * f, wave = 0.012 * Math.sin(f * 6.5 + 0.6) * (0.4 + f * 0.8) + 0.006 + 0.01 * f, dz = 0.012 * 6.5 * Math.cos(f * 6.5 + 0.6) * (0.4 + f * 0.8) / (x1 - x0);
        const nl = Math.hypot(dz, 1), top = yt + (ym - yt) * f, bot = yb + (ym - yb) * f;
        const u = rect.u0 + f * (rect.u1 - rect.u0), vt = rect.v0 + (rect.v1 - rect.v0) * 0.5 * f, vb = rect.v0 + (rect.v1 - rect.v0) * (1 - 0.5 * f);
        cols.push({ a: [x, top, WZ + wave], b: [x, bot, WZ + wave * 1.3], n: [-dz / nl, 0, 1 / nl], ua: [u, vt], ub: [u, vb] });
      }
      CL.ribbon(cols, [0.85, 0.82, 0.8]);
      for (const [x, y] of [[x0 + 0.015, yt - 0.02], [x0 + 0.015, yb + 0.02], [x1 - 0.015, ym]]) MM.box(x, y, WZ + 0.02, 0.014, 0.014, 0.012, { all: T.iron }, { tint: [1.7, 1.35, 0.55], ao: 0 });
    }
    // the note under the car poster: paper, a strip of tape across its top, a slight lean
    M.box(0.96, 1.22, WZ, 0.38, 0.5, 0.004, { pz: T.noteHand, side: T.noteHand }, { rot: [0, 0, -0.035], ao: 0, tint: [0.4, 0.38, 0.35] });
    M.box(0.955, 1.465, WZ + 0.004, 0.07, 0.035, 0.002, { pz: T.tapeStrip }, { rot: [0, 0, -0.02], tint: [0.6, 0.6, 0.55], ao: 0 });
    // the VHS tapes on the TV beside the VCR
    M.box(-0.7, 1.19, -6.66, 0.19, 0.027, 0.105, { py: T.vhs, pz: T.vhs, side: T.vhs }, { rot: [0, 0.12, 0] }); M.box(-0.69, 1.217, -6.665, 0.19, 0.027, 0.105, { py: T.vhs, pz: T.vhs, side: T.vhs }, { rot: [0, -0.06, 0], tint: [1.05, 0.9, 0.9] });

    // the bookshelf (1.1 m wide, 0.3 deep, 2.1 m high, against the wall; the boombox stands in front of its open lower bay)
    const sx = 2.35, sz = -6.84, sw = 1.1, sd = 0.3, sh0 = 2.1, WOOD = [0.3, 0.2, 0.13];
    for (const dx of [-1, 1]) M.box(sx + dx * (sw / 2 - 0.0125), sh0 / 2, sz, 0.025, sh0, sd, { all: T.wood }, { tint: WOOD });
    M.box(sx, sh0 / 2, sz - sd / 2 + 0.006, sw - 0.05, sh0, 0.012, { all: T.woodDark }, { tint: [0.6, 0.48, 0.4] });
    const boards = [0.5, 1.0, 1.5];
    for (const y of boards) M.box(sx, y, sz, sw - 0.05, 0.022, sd, { all: T.wood }, { tint: WOOD, bottom: true });
    M.box(sx, sh0 + 0.011, sz + 0.005, sw + 0.03, 0.02, sd + 0.02, { all: T.wood }, { tint: WOOD, bottom: true });                                                      // the top, overhanging a little
    // bay A (1.51..2.09): the three rule books lying flat, spines out, a hair off square; a row of standing books and a little wooden box beside them
    {
      const bx = sx + 0.17, z = sz + 0.01, y0 = 1.511;
      M.box(bx, y0 + 0.03, z, 0.33, 0.058, 0.25, { pz: T.bookEmber, py: T.covers[0], px: T.pages, nx: T.pages }, { rot: [0, 0.03, 0] });
      M.box(bx + 0.01, y0 + 0.09, z - 0.005, 0.325, 0.058, 0.245, { pz: T.bookBeasts, py: T.covers[3], px: T.pages, nx: T.pages }, { rot: [0, -0.04, 0] });
      M.box(bx - 0.005, y0 + 0.15, z, 0.315, 0.056, 0.24, { pz: T.bookRoads, py: T.covers[1], px: T.pages, nx: T.pages }, { rot: [0, 0.05, 0] });
      let x = sx - 0.5 + 0.06;
      for (let i = 0; i < 4; i++) { const t = [1, 5, 6, 3][i], wd = 0.032 + i * 0.006, ht = 0.3 + (i % 2) * 0.03; x += wd / 2; M.box(x, y0 + ht / 2, z, wd, ht, 0.2, { pz: T.spines[t], py: T.pages, side: T.covers[t] }, { ao: 0 }); x += wd / 2 + 0.002; }
      M.box(sx - 0.2, y0 + 0.045, z, 0.16, 0.09, 0.13, { all: T.woodDark }, { tint: [1.0, 0.9, 0.8], rot: [0, 0.2, 0] });
    }
    // bay B (1.01..1.49): the dice pouch (leather, cinched, its string hanging), its dice, and the small iron-bound chest
    {
      const px = sx - 0.22, y0 = 1.011, z = sz + 0.03;
      M.blob(px, y0 + 0.085, z, 0.085, 0.1, 0.075, 12, 16, T.leather, { bottom: 0.3, lump: 0.05, ao: 0, tint: [0.75, 0.6, 0.5] });
      M.cyl(px, y0 + 0.16, z, 0.022, 0.045, 0.045, 10, T.leather, null, { tint: [0.6, 0.5, 0.42], ao: 0 });                                    // the neck, cinched
      M.cyl(px, y0 + 0.2, z, 0.05, 0.026, 0.045, 10, T.leather, null, { tint: [0.8, 0.65, 0.55], ao: 0 });                                    // and the flared top
      M.cyl(px, y0 + 0.17, z, 0.03, 0.03, 0.012, 10, T.leather, null, { tint: [0.3, 0.24, 0.18], ao: 0 });                                    // the string round it
      M.rod([px + 0.03, y0 + 0.17, z], [px + 0.08, y0 + 0.07, z + 0.07], 0.007, T.leather, { tint: [0.3, 0.24, 0.17], ao: 0 });
      const dice = [[0.17, 0.05, [1.5, 0.15, 0.12], 0.4, 0.3], [0.22, 0.09, [0.15, 0.25, 1.5], 1.1, 0.7], [0.14, 0.12, [1.6, 1.3, 0.3], 2.0, 1.2], [0.26, 0.04, [0.2, 1.2, 0.4], 0.2, 2.1], [0.2, 0.13, [1.4, 0.2, 1.1], 0.9, 0.4]];
      for (const [dx, dz, tn, a, b] of dice) M.box(px + dx, y0 + 0.014, z + dz - 0.02, 0.028, 0.028, 0.028, { all: T.dice }, { tint: tn.map((v) => v * 0.7), rot: [a, b, 0.3], ao: 0 });
      const cx = sx + 0.24;
      M.box(cx, y0 + 0.065, z, 0.28, 0.13, 0.18, { all: T.chest }, { ao: 0 });
      M.box(cx, y0 + 0.147, z, 0.28, 0.04, 0.18, { all: T.chest }, { ao: 0 }); M.box(cx, y0 + 0.178, z, 0.24, 0.026, 0.145, { all: T.chest }, { ao: 0 });
      MM.box(cx, y0 + 0.1, z + 0.092, 0.045, 0.06, 0.008, { all: T.iron }, { tint: [1.4, 1.1, 0.4], ao: 0 });
    }
    // bay C (0.51..0.99): paperbacks and hardcovers standing at the left, a wooden crate of record sleeves at the right
    {
      let x = sx - 0.5 + 0.06; const y0 = 0.511, z = sz + 0.03;
      for (let i = 0; i < 9; i++) {
        const t = Math.floor(q2() * 7), wd = 0.032 + q2() * 0.026, ht = 0.26 + q2() * 0.1, lean = i === 8 ? 0.22 : 0;
        x += wd / 2; M.box(x, y0 + ht / 2 + (lean ? 0.01 : 0), z, wd, ht, 0.2, { pz: T.spines[t], py: T.pages, side: T.covers[t] }, { rot: [0, 0, lean], ao: 0 }); x += wd / 2 + (lean ? 0.07 : 0.002);
      }
      const cx = sx + 0.22;
      M.box(cx, y0 + 0.1, z, 0.4, 0.2, 0.25, { all: T.wood }, { tint: [0.55, 0.42, 0.32], ao: 0 });
      for (let i = 0; i < 5; i++) M.box(cx - 0.13 + i * 0.065, y0 + 0.22, z, 0.012, 0.22, 0.22, { all: T.sleeves }, { rot: [0.08 - i * 0.03, 0, 0.05], ao: 0, tint: [0.5, 0.5, 0.5] });
    }
    hit('shelf', sx, sh0 / 2, sz, sw / 2, sh0 / 2, sd / 2);
    sh(sx, sz + 0.1, sw + 0.1, sd + 0.3, 0.7);

    // the ivy: a pot at the right end of the top, three vines over the edge, hanging down the shelf's right side
    {
      const px = sx + 0.36, py = sh0 + 0.021, z = sz + 0.01, edge = sx + sw / 2 + 0.03;
      M.cyl(px, py, z, 0.08, 0.06, 0.12, 14, T.terra, T.soil, { ao: 0 });
      for (const [oz, len, ph] of [[0.0, 0.62, 0.0], [0.05, 0.84, 0.5], [-0.04, 0.46, 1.0]]) {
        const pts = [], NN = 12;
        for (let i = 0; i <= NN; i++) {
          const f = i / NN, g = Math.min(1, f / 0.25);
          pts.push([px + 0.04 + (edge - px - 0.04) * g + 0.025 * Math.sin(ph + f * 7) * g, py + 0.125 + 0.035 * Math.sin(g * PI) - Math.max(0, (f - 0.25) / 0.75) * len, sz + oz + 0.02 + 0.09 * Math.min(1, f * 2) + 0.03 * Math.sin(ph * 2 + f * 6)]);
        }
        for (let i = 0; i < NN; i++) M.rod(pts[i], pts[i + 1], 0.007, T.white, { tint: [0.12, 0.24, 0.08], ao: 0 });
        for (let i = 1; i <= NN; i++) for (let k = 0; k < 2; k++) {
          const a = pts[i - 1], b = pts[i], t = k * 0.5, c = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t], ls = 0.06 + q2() * 0.035, yaw = (q2() - 0.5) * 1.8 + (k ? 0.4 : -0.4), cy = Math.cos(yaw), sy = Math.sin(yaw);
          const tx = cy * ls / 2, tz = sy * ls / 2, ox = (k ? 1 : -1) * 0.018, droop = 0.9 * ls;
          CL.quad([[c[0] + ox - tx * 0.2, c[1], c[2] - tz * 0.2], [c[0] + ox + tx * 0.2, c[1], c[2] + tz * 0.2], [c[0] + ox + tx, c[1] - droop, c[2] + tz + 0.02], [c[0] + ox - tx, c[1] - droop, c[2] - tz + 0.02]], [sy * 0.4, 0.2, cy], T.leaf, [0.9 + q2() * 0.3, 0.9 + q2() * 0.3, 0.9], 0);
        }
      }
      for (let i = 0; i < 10; i++) {                                                                           // leaves standing in the pot
        const a = i / 10 * PI * 2, rr = 0.03 + q2() * 0.03, cxx = px + Math.sin(a) * rr, czz = z + Math.cos(a) * rr, ht = 0.08 + q2() * 0.05, ds = 0.03;
        CL.quad([[cxx - 0.025, py + 0.115, czz], [cxx + 0.025, py + 0.115, czz], [cxx + 0.03 + Math.sin(a) * ds, py + 0.115 + ht, czz + Math.cos(a) * ds], [cxx - 0.03 + Math.sin(a) * ds, py + 0.115 + ht, czz + Math.cos(a) * ds]], [Math.sin(a), 0.3, Math.cos(a)], T.leaf, [1, 1, 1], 0);
      }
    }
    // the potted plant at the far left: a pot on a little wall shelf, a dozen long leaves arching out
    {
      const px = -2.47, z = -6.86, y0 = 1.5;
      M.box(px, y0 - 0.0125, z + 0.01, 0.46, 0.025, 0.24, { all: T.wood }, { tint: [0.7, 0.5, 0.34], ao: 0 });
      for (const dx of [-0.17, 0.17]) M.box(px + dx, y0 - 0.1, z - 0.095, 0.03, 0.17, 0.03, { all: T.wood }, { tint: [0.65, 0.46, 0.3], ao: 0 });
      M.cyl(px, y0, z + 0.01, 0.1, 0.075, 0.17, 16, T.terra, T.soil, { ao: 0 });
      for (let i = 0; i < 13; i++) {
        const a = (i / 12 - 0.5) * PI * 1.7 + (q2() - 0.5) * 0.2, len = 0.42 + q2() * 0.22, wd = 0.08 + q2() * 0.03, out = 0.12 + q2() * 0.25, up = 0.9 + q2() * 0.4;
        const base = [px + Math.sin(a) * 0.02, y0 + 0.17, z + 0.01 + Math.cos(a) * 0.02], dir = [Math.sin(a), 0, Math.cos(a)];
        let prev = base; const tw = q2() * 0.9, sidev = [Math.cos(a) * Math.cos(tw), Math.sin(tw), -Math.sin(a) * Math.cos(tw)], rc = T.blade, wh = wd / 2;
        for (let s_ = 1; s_ <= 3; s_++) {
          const f = s_ / 3, ang = (1 - f) * up + f * (-0.1), r_ = len * 0.33;
          const nxt = [prev[0] + dir[0] * Math.cos(ang) * r_ * (0.4 + out), prev[1] + Math.sin(ang) * r_, prev[2] + dir[2] * Math.cos(ang) * r_ * (0.4 + out)];
          // (the tile's own taper makes the blade: each of the three segments is a third of the tile, base at the bottom)
          CL.quad([[prev[0] - sidev[0] * wh, prev[1], prev[2] - sidev[2] * wh], [prev[0] + sidev[0] * wh, prev[1], prev[2] + sidev[2] * wh], [nxt[0] + sidev[0] * wh, nxt[1], nxt[2] + sidev[2] * wh], [nxt[0] - sidev[0] * wh, nxt[1], nxt[2] - sidev[2] * wh]],
            [dir[0] * 0.4, 0.9, dir[2] * 0.4], { u0: rc.u0, u1: rc.u1, v0: rc.v0 + (rc.v1 - rc.v0) * (3 - s_) / 3, v1: rc.v0 + (rc.v1 - rc.v0) * (4 - s_) / 3 }, [0.85 + q2() * 0.3, 0.9 + q2() * 0.2, 0.85], 0);
          prev = nxt;
        }
      }
    }
  }

  // ------------------------------------------------------------------------------------------ MID-ROOM: the ping-pong table, the steel beam and its two posts
  {
    const px = 4.7, pz = 1.55, pw = 2.74, pd = 1.52;
    NC.box(px, 0.745, pz, pw, 0.032, pd, { py: T.pong, side: T.woodDark }, { ao: 0.5 });
    NC.box(px, 0.69, pz, pw - 0.2, 0.08, pd - 0.2, { all: T.woodDark }, { ao: 0.5 });
    for (const [dx, dz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) NC.box(px + dx * (pw / 2 - 0.12), 0.36, pz + dz * (pd / 2 - 0.12), 0.06, 0.72, 0.06, { all: T.steel });
    CL.quad([[px + 0.005, 0.762, pz + pd / 2 + 0.07], [px + 0.005, 0.762, pz - pd / 2 - 0.07], [px + 0.005, 0.915, pz - pd / 2 - 0.07], [px + 0.005, 0.915, pz + pd / 2 + 0.07]], [1, 0, 0], T.net, [1, 1, 1], 0);
    for (const sz of [1, -1]) NC.box(px, 0.83, pz + sz * (pd / 2 + 0.07), 0.04, 0.17, 0.03, { all: T.steel });                // the clamps
    NC.cyl(px - 0.7, 0.765, pz - 0.25, 0.085, 0.085, 0.009, 14, T.paddle, T.paddle, { th0: 0.5 }); NC.box(px - 0.7, 0.768, pz - 0.05, 0.03, 0.02, 0.12, { all: T.wood }, { rot: [0, 0.5, 0] });
    NC.cyl(px + 0.55, 0.765, pz + 0.3, 0.085, 0.085, 0.009, 14, T.paddle, T.paddle, { th0: 2 }); NC.box(px + 0.62, 0.768, pz + 0.48, 0.03, 0.02, 0.12, { all: T.wood }, { rot: [0, -0.7, 0] });
    NC.cyl(px + 0.2, 0.764, pz - 0.4, 0.02, 0.02, 0.04, 8, T.tape, T.tape);
    sh(px, pz, pw - 0.3, pd - 0.3, 0.4); hit('pingpong', px, 0.38, pz, pw / 2, 0.38, pd / 2);
    // a steel beam under the joists, posts at its two thirds
    const bz = -1.7;
    MM.box(0, 2.99, bz, 17.9, 0.02, 0.17, { all: T.steel }, { bottom: true, ao: 0 }); MM.box(0, 2.72, bz, 17.9, 0.02, 0.17, { all: T.steel }, { bottom: true, ao: 0 });
    MM.box(0, 2.855, bz, 17.9, 0.25, 0.014, { all: T.steel }, { ao: 0 });
    for (const x of [-2.5, 4.6]) {
      MM.cyl(x, 0.02, bz, 0.045, 0.045, 2.75, 14, T.steel, T.steel, { ao: 0.6 }); MM.box(x, 0.01, bz, 0.2, 0.02, 0.2, { all: T.steel }, { ao: 0.5 }); MM.box(x, 2.755, bz, 0.2, 0.014, 0.2, { all: T.steel }, { ao: 0, bottom: true });
      sh(x, bz, 0.4, 0.4, 0.8); hit('post', x, 1.4, bz, 0.07, 1.4, 0.07);
    }
  }

  // ====================================================================================================== the meshes
  const bounceMat = (m) => withBounce(m);
  const matOpaque = bounceMat(new THREE.MeshStandardMaterial({ map: tex, vertexColors: true, roughness: 0.82, metalness: 0 }));
  const matMetal = bounceMat(new THREE.MeshStandardMaterial({ map: tex, vertexColors: true, roughness: 0.42, metalness: 0.78 }));
  const matCloth = bounceMat(new THREE.MeshStandardMaterial({ map: tex, vertexColors: true, roughness: 0.95, metalness: 0, side: THREE.DoubleSide, alphaTest: 0.5 }));
  const matGlow = new THREE.MeshBasicMaterial({ map: tex, vertexColors: true });
  matCloth.customProgramCacheKey = () => 'basementprops-bounce-cloth';
  const group = new THREE.Group(); group.name = 'basementprops';
  const meshes = [];
  const add = (mb, mat, name, shadow = true, receive = shadow) => {
    if (!mb.n) return;
    const m = new THREE.Mesh(mb.geometry(), mat); m.name = name; m.matrixAutoUpdate = false; m.frustumCulled = true;
    m.castShadow = shadow; m.receiveShadow = receive; group.add(m); meshes.push(m);
  };
  add(M, matOpaque, 'props'); add(NC, matOpaque, 'props_nocast', false, true); add(MM, matMetal, 'props_metal'); add(CL, matCloth, 'props_cloth'); add(GL, matGlow, 'props_glow', false);

  // contact shadows: one mesh of soft dark quads on the carpet
  {
    const S = 96, cv = document.createElement('canvas'); cv.width = cv.height = S; const c = cv.getContext('2d'), id = c.createImageData ? c.createImageData(S, S) : null;
    if (id && id.data) {
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const u = Math.abs(x + 0.5 - S / 2) / (S / 2), v = Math.abs(y + 0.5 - S / 2) / (S / 2), d = Math.pow(Math.pow(u, 3.2) + Math.pow(v, 3.2), 1 / 3.2);     // a rounded box
        const a = 1 - smooth(0.42, 1.0, d); const i = (y * S + x) * 4; id.data[i] = id.data[i + 1] = id.data[i + 2] = 0; id.data[i + 3] = Math.round(255 * a * a * 0.82);
      }
      c.putImageData(id, 0, 0);
    }
    const stx = new THREE.CanvasTexture(cv); stx.colorSpace = THREE.SRGBColorSpace; stx.needsUpdate = true;
    const P = [], U = [], I = [], N = [], K = [];
    shadows.forEach((s, i) => {
      const w = (s.w + 0.16) * 1.22 / 2, d = (s.d + 0.16) * 1.22 / 2, ca = Math.cos(s.rot), sa = Math.sin(s.rot);
      const pts = [[-w, d], [w, d], [w, -d], [-w, -d]], uv = [[0, 1], [1, 1], [1, 0], [0, 0]];
      pts.forEach(([px, pz], k) => { P.push(s.x + px * ca + pz * sa, 0.0045 + i * 0.00002, s.z - px * sa + pz * ca); N.push(0, 1, 0); U.push(uv[k][0], uv[k][1]); K.push(1, 1, 1, Math.min(1, s.k / 0.8)); });   // (k = how dark this one is, as the alpha of its corners; 0.8 and up keeps the full darkness, a big shape that only shades the floor under it, like the ping-pong table, asks for less)
      I.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
    });
    if (shadows.length) {
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(K, 4)); g.setIndex(I);
      const mat = new THREE.MeshBasicMaterial({ map: stx, vertexColors: true, color: new THREE.Color(0.012, 0.008, 0.005), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      const m = new THREE.Mesh(g, mat); m.name = 'props_shadows'; m.matrixAutoUpdate = false; m.renderOrder = 1; group.add(m); meshes.push(m);
    }
  }
  // the four bare-bulb lights (no shadows: cheap), on the group so the whole lot can be switched off together
  for (const b of bulbs) {
    const l = new THREE.PointLight(new THREE.Color(b.tint[0], b.tint[1], b.tint[2]), b.I * PI, b.range, 2); l.position.set(...b.pos); l.name = b.name; l.userData.base = l.intensity; group.add(l); lights[b.name] = l;
  }
  let tris = 0; for (const m of meshes) tris += m.geometry.index.count / 3;
  const stats = { drawCalls: meshes.length, triangles: tris, vertices: meshes.reduce((a, m) => a + m.geometry.attributes.position.count, 0), colliders: colliders.length, lights: bulbs.length, shadowQuads: shadows.length, atlas: atlas.size, parts: meshes.map((m) => [m.name, m.geometry.index.count / 3]) };
  return { group, colliders, lights, metals: [matMetal], stats, atlasCanvas: atlas.cv };
}
