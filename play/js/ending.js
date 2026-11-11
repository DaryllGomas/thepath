// THE ENDING of the web game (docs/pitch/THE_PATH_build_plan_v1, scenes 11-13; canon: docs/CONSOLIDATION/chatgpt/05 and 07).
// The cabinet with no name plays its SEVEN games (js/cabinet/seven/: Hearth to the Tunnel, joined by THE REDRAW) on its own
// tube. When the tube reports the run's win (the Tunnel's passage has played on it; step 1b's THE GATE and A·V·R go in
// js/cabinet/seven/finale.js, before the report), there is a clunk and a brass token with the Gate on it rises into the coin
// return. You take it. Four lines. Then the pull: the tube gains impossible depth, the arcade stretches, you are drawn into
// the glass, THE PATH shows once, and you are through: the warp (js/warp.js; the trailer v2, 44-52 s), time rushing past,
// until its light turns white, and a quiet end. The tube (ctx.tube) only has to hold its last picture on tube.t.
// All of it is scene and overlay: no cartridge's sim is touched. No light is added (the cabinet's own glow, one of the pool's
// lights, carries the warp's cold light), and every material here is built at load so main.js's precompile warms it.
import * as THREE from 'three';
import * as MARKS from './marks.js';
import { UNGRADE_GLSL, gradeUniforms } from './cabinet/seven/glass.js';
import { Warp, UNGRADE_HDR, THROUGH, WARP_LEN, warpSpeed, warpLook, drawIn } from './warp.js';

export const NAMELESS = 'nameless';
const DEG = Math.PI / 180;
const IDLE = { x: 0, y: 0, a: false, b: false, start: false };
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };
const ease = (x) => { x = clamp01(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
function loadImage(src) { const i = new Image(); i.decoding = 'async'; i.src = src; return i; }

// ============================================================================ ARCHIVED (9/29): the retired ring puzzle's tube
// NamelessScreen ran the 9/27 'nameless' cartridge (RETIRED: docs/THE_PLAN/CABINET_SEVEN_GAMES.md). The arcade no longer uses
// it (js/main.js runs js/cabinet/seven/ instead); it is kept here, untouched, for reference and for cabinet.html's lineage.
// ---------------------------------------------------------------------------- the tube: the cartridge, or a stand-in until it lands
// The cartridge's own browser runner (cart.createRunner(): CabinetRunner's API, drawing its showpiece on run.canvas, 640x480):
// the tube's texture IS run.canvas (a CanvasTexture, re-uploaded when run.dirty). Its pixels are never read back: a
// getImageData on it sends Chrome's canvas to software (about 50x slower). Without createRunner, the engine's CabinetRunner on
// the 320x240 surface like every other game, copied onto this tube's own canvas. No cartridge at all: the stand-in.
const STANDIN = ['assets/art_out/pb_starfield_01.png', 'assets/art_out/pb_starfield_02.png', 'assets/art_out/pb_scoretable_blank.png'];
export class NamelessScreen {
  constructor(runtime) {
    this.cart = (runtime && runtime.get(NAMELESS)) || null;
    this.c = document.createElement('canvas'); this.c.width = 640; this.c.height = 480;
    this.g = this.c.getContext('2d');
    this.t = this._texture();
    this.m = null; this.playing = false; this.onOver = null; this.frozen = false; this.shown = false;
    this.runner = null;
    this.imgs = STANDIN.map(loadImage);
    this.st = { t: 0, mode: 'attract', winT: 0, acc: 1 };
    if (this.cart) {
      this.won = (r, info) => r === runtime.RoundResult.Won && !(info && info.aborted);
      this.sc = document.createElement('canvas'); this.sg = this.sc.getContext('2d');
      const opts = { cabinetId: NAMELESS, freePlay: false, width: 640, height: 480,
        reducedMotion: !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) };
      const engine = () => new runtime.CabinetRunner(this.cart, opts);
      // until the runner is up (a moment after load, long before the van) the tube shows the stand-in's attract
      this.ready = (typeof this.cart.createRunner === 'function' ? Promise.resolve().then(() => this.cart.createRunner(opts)) : Promise.resolve(engine()))
        .catch((e) => { console.warn('[nameless] its own runner failed; the engine runner instead', e); return engine(); })
        .then((r) => {
          this.runner = r; this.shown = false;
          if (r.canvas && r.canvas.width > 0) {          // the showpiece canvas is the texture itself
            const old = this.t; this.direct = true;
            this.t = new THREE.CanvasTexture(r.canvas); this.t.colorSpace = THREE.SRGBColorSpace;
            this.t.minFilter = THREE.LinearFilter; this.t.magFilter = THREE.LinearFilter; this.t.generateMipmaps = false;
            this._show(); old.dispose();
          }
        });
    } else this.ready = Promise.resolve();
  }
  // The cartridge's canvas renderer pays a one-time GPU cost the first time each beat of its win is drawn (measured: a ~95 ms
  // frame as the vesica opens). Pay it early instead (main.js: when the van pulls up, a minute before the cabinet is in): a
  // spare runner is run (unseen, by the cartridge's
  // precise bot) to each beat of the ending and draws it once, uploaded to the GPU so the canvas really flushes. Its pixels are
  // never read back. The spare has its own cabinet id: it touches neither this cabinet's mercy ledger nor its table.
  async warmWin(renderer) {
    if (this.warming || !this.cart || typeof this.cart.createRunner !== 'function' || !renderer) return;
    this.warming = true;
    const tick = () => new Promise((r) => setTimeout(r, 40));
    // the unseen run, a little per tick (at most half a second of the sim, a few ms): never a long frame of its own
    const run = async (w, until) => { for (let i = 0; i < 400 && w.phase === 'playing' && !until(w.sim); i++) { w.fastForward(0.5, until); await tick(); } };
    await this.ready;
    if (!this.direct) return;
    let w = null, tex = null;
    try {
      w = await this.cart.createRunner({ cabinetId: NAMELESS + '_warm', notice: false, width: this.t.image.width, height: this.t.image.height });
      tex = new THREE.CanvasTexture(w.canvas); tex.generateMipmaps = false; tex.minFilter = THREE.LinearFilter;
      const up = () => { tex.needsUpdate = true; renderer.initTexture(tex); };
      w.insertCoin();
      const B = w._bot && w._bot.constructor; if (B) { const b = new B('oracle'); b.reset(777); w._bot = b; }
      w.botDrives = true;
      if (!w.sim || typeof w.sim.debugJump !== 'function') return;
      w.sim.debugJump(4);
      w.step(1 / 60, null); up();
      await run(w, (sm) => sm.p === 6);
      const beats = [[6, 0.4], [7, 0.4], [7, 1.45], [8, 0.0], [8, 0.08], [8, 0.2], [8, 0.5], [8, 1.0], [8, 1.8], [8, 2.6], [9, 0.4], [10, 0.6], [10, 1.8], [11, 1.0], [12, 0.4], [12, 1.4], [12, 2.8], [13, 1.0]];
      for (const [ph, at] of beats) {
        if (w.phase !== 'playing') break;
        await run(w, (sm) => sm.p > ph || (sm.p === ph && sm.phaseTime >= at));
        w.step(1 / 60, null); up();
        await tick();
      }
      this.warmed = true;
    } catch (e) { console.warn('[nameless] warm-up', e); }
    finally { if (tex) tex.dispose(); if (w && w.phase === 'playing') { w.onRoundOver = null; w.abort(); } }
  }
  get live() { return !!this.runner; }
  get canStart() { return !this.frozen && (!this.cart || !!this.runner); }
  _texture() {
    const t = new THREE.CanvasTexture(this.c); t.colorSpace = THREE.SRGBColorSpace;
    t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = false;
    return t;
  }
  // the delivered cabinet's CRT material (js/crt.js); the tube shows this canvas from now on
  attach(material) { this.m = material; this._show(); }
  _show() { if (!this.m) return; const u = this.m.uniforms; u.map.value = this.t; u.nextMap.value = this.t; u.blend.value = 0; }
  start() {
    if (!this.canStart) return false;
    if (this.runner) {
      const ok = this.runner.insertCoin();
      if (ok) {
        this.playing = true;
        this.runner.onRoundOver = (result, summary, info) => {
          this.playing = false;
          const won = this.won(result, info);
          if (won) this.freeze();                       // the tube keeps the cartridge's last frame (the Gate, A·V·R)
          this.onOver && this.onOver(won, info);
        };
      }
      return ok;
    }
    this.playing = true; this.st.mode = 'play'; this.st.t = 0; return true;
  }
  abort() {
    if (!this.playing) return;
    if (this.runner) this.runner.abort();
    else { this.playing = false; this.st.mode = 'attract'; this.onOver && this.onOver(false, null); }
  }
  // the dev hook window.__node.winCabinet() (the stand-in's only way to win). With the real cartridge: its bot takes over, jumps
  // to level V and runs (unseen) to full resonance, so the cartridge's own ending then plays on the tube in real time and reports
  // Won itself. { bot: true }: the bot just plays the round out (and may lose). { now: true }: the Won path at once.
  winNow(opts = {}) {
    if (!this.playing) return false;
    const r = this.runner;
    if (r) {
      if (opts.now) { this.freeze(); this.playing = false; r.onRoundOver = null; this.onOver && this.onOver(true, { forced: true }); return true; }
      r.botDrives = true;
      if (opts.bot) return true;
      if (r.inNotice && typeof r._beginRound === 'function') r._beginRound();
      if (r.sim && typeof r.sim.debugJump === 'function' && typeof r.fastForward === 'function') {
        // the cartridge's precise bench bot ('oracle': opens every core in seconds on any credit); its first-timer can lose V
        try { const B = r._bot && r._bot.constructor; if (B) { const b = new B('oracle'); b.reset(12345); r._bot = b; } } catch (e) { /* keep its own */ }
        r.sim.debugJump(4);
        if (r.renderer && r.renderer.clearTrails) r.renderer.clearTrails();
        r.fastForward(300, (sim) => sim.p === 6);          // Align: full resonance on V; the ending runs from here
      }
      return true;
    }
    if (this.st.mode === 'play') { this.st.mode = 'win'; this.st.winT = 0; }
    return true;
  }
  // the tube keeps what the cartridge last drew (run.canvas is not stepped again; its last frame is uploaded after the step)
  freeze() { this.frozen = true; }
  update(dt, input) {
    if (!this.m || this.frozen) return;
    if (this.runner) {
      this.runner.step(dt, input || IDLE);
      // the step that reported Won has also drawn the runner's Over frame, where the playfield comes back (the sim's ending
      // flag ends at Card); the tube keeps the last Card frame instead: THE GATE over the A·V·R table
      if (this.frozen) return;
      if (this.runner.dirty || !this.shown) this._blit();
    } else if (!this.cart || !this.shown) this._standIn(dt);
  }
  // the tube, not stepped (you are not in the Junction): nothing to do; the last frame stays on the glass
  get phase() { return this.runner ? this.runner.phase : (this.playing ? 'playing' : 'attract');
  }
  _blit() {
    if (this.direct) { this.t.needsUpdate = true; this.shown = true; return; }
    const r = this.runner, A = r.attract;
    const rend = r.phase === 'attract' ? (A && A.current === 1 ? A._renderer : null) : r._renderer;
    const src = r.canvas || (rend && (rend.canvas || rend.domElement)) || (r.surface && r.surface.canvas) || null;
    if (src && src.width > 0 && src.height > 0) {
      this._fit(src.width, src.height);
      this.g.imageSmoothingEnabled = true; this.g.drawImage(src, 0, 0, this.c.width, this.c.height);
    } else {
      const s = r.surface, w = s.width || 320, h = s.height || 240;
      if (this.sc.width !== w || this.sc.height !== h) { this.sc.width = w; this.sc.height = h; this.img = null; }
      if (!this.img || this.img.data !== s.data) this.img = new ImageData(s.data, w, h);
      this.sg.putImageData(this.img, 0, 0);
      this._fit(w, h);
      this.g.imageSmoothingEnabled = false; this.g.drawImage(this.sc, 0, 0, this.c.width, this.c.height);
    }
    this.shown = true; this.t.needsUpdate = true;
  }
  // 640x480 by default; a bigger source grows the tube's canvas once (a new texture, so its storage fits)
  _fit(w, h) {
    if (w <= this.c.width && h <= this.c.height) return;
    this.c.width = Math.max(w, this.c.width); this.c.height = Math.max(h, this.c.height);
    this.t.dispose(); this.t = this._texture(); this._show();
  }
  // ---- the stand-in: the Unity attract frames, INSERT COIN; on the dev hook, the top row of the table fills A·V·R, then Won
  _standIn(dt) {
    const S = this.st; S.t += dt; S.acc += dt;
    if (S.mode === 'win') {
      S.winT += dt;
      if (S.winT > 3.6 && this.playing) { this.playing = false; this.frozen = true; this._drawStandIn(); this.onOver && this.onOver(true, { standIn: true }); return; }
    }
    if (S.acc < 1 / 30) return;                   // 30 Hz is plenty for a starfield
    S.acc = 0; this._drawStandIn();
  }
  _drawStandIn() {
    const S = this.st, g = this.g, W = this.c.width, H = this.c.height, [a, b, table] = this.imgs;
    g.globalAlpha = 1; g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    const stars = S.mode === 'win' ? 1 - clamp01(S.winT / 0.8) : 1;
    if (stars > 0) {
      const k = 0.5 + 0.5 * Math.sin(S.t * 0.25), dx = (S.t * 3) % W;
      for (const [img, al] of [[a, (1 - k) * stars], [b, k * stars]]) {
        if (!img.complete || !img.naturalWidth) continue;
        g.globalAlpha = al; g.drawImage(img, -dx, 0, W, H); g.drawImage(img, W - dx, 0, W, H);
      }
      g.globalAlpha = 1;
    }
    g.textAlign = 'center'; g.textBaseline = 'middle';
    if (S.mode === 'attract' && Math.floor(S.t) % 2 === 0) { g.fillStyle = '#d8ecff'; g.font = '52px VT323, monospace'; g.fillText('INSERT COIN', W / 2, H * 0.74); }
    if (S.mode === 'win' && S.winT > 0.8 && table.complete && table.naturalWidth) {
      g.globalAlpha = clamp01((S.winT - 0.8) / 0.5); g.drawImage(table, 0, 0, W, H);
      // the blank top row ('- - -' in the art) fills in, one letter at a time
      const sx = W / 512, sy = H / 384;
      g.fillStyle = '#000'; g.fillRect(150 * sx, 112 * sy, 104 * sx, 36 * sy);
      g.fillStyle = '#e8eef8'; g.font = Math.round(46 * sy) + 'px VT323, monospace';
      ['A', 'V', 'R'].forEach((ch, i) => { if (S.winT > 1.6 + i * 0.4) g.fillText(ch, (172 + i * 30) * sx, 131 * sy); });
      g.globalAlpha = 1;
    }
    this.t.needsUpdate = true;
  }
}

// ============================================================================ the tube becomes a window into the warp
// Drawn on the tube's own mesh. At depth 0 it is exactly the tube (js/crt.js's look, the frozen last frame); as depth rises the
// picture gives way to js/warp.js's tunnel, sampled at this pixel's place on the screen: the warp is rendered from a camera that
// stands where you stand relative to the glass, so the glass is a true window (real parallax), and when you are through it the
// same picture goes full screen without a seam.
const tunnelVert = /* glsl */`
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const tunnelFrag = /* glsl */`
  uniform sampler2D map, portal;
  uniform vec2 portalRes;
  uniform float brightness, curve, scan, scanCount, grille, vignette, chroma, roll, noise, time;
  uniform float depth, glow;
  varying vec2 vUv;
  ${UNGRADE_GLSL}
  ${UNGRADE_HDR}
  float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
  void main() {
    // ---- the tube as js/crt.js draws it (so the swap to this material does not show)
    vec2 uv0 = vec2(vUv.x, 1.0 - vUv.y);
    vec2 cc = uv0 * 2.0 - 1.0; float r2 = dot(cc, cc); cc *= 1.0 + curve * r2;
    vec2 uv = cc * 0.5 + 0.5;
    float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
    vec3 pic;
    pic.r = texture2D(map, uv + vec2(chroma, 0.0)).r; pic.g = texture2D(map, uv).g; pic.b = texture2D(map, uv - vec2(chroma, 0.0)).b;
    float sc = 1.0 - scan * (0.5 + 0.5 * sin(uv.y * scanCount * 6.2831853));
    float px = mod(gl_FragCoord.x, 3.0);
    vec3 gr = 1.0 - grille * (1.0 - vec3(step(px, 1.0), step(1.0, px) * step(px, 2.0), step(2.0, px)));
    float ph = fract(uv.y * 0.5 - time * 0.08);
    float bar = 1.0 + roll * smoothstep(0.0, 0.08, ph) * (1.0 - smoothstep(0.08, 0.2, ph));
    float snow = 1.0 + noise * (hash(uv * 400.0 + time) - 0.5);
    vec2 v = uv * (1.0 - uv);
    float vig = pow(clamp(v.x * v.y * 40.0, 0.0, 1.0), vignette * 0.35);
    // (the seven's glass, js/cabinet/seven/glass.js, hands the room's grade an ungraded picture: so does the tube here)
    vec3 tube = ungrade(pic * sc * gr * bar * snow * vig * inside * brightness) + vec3(0.004, 0.006, 0.010) * inside;
    // ---- the warp behind the glass, at this pixel's place on the screen
    vec3 k = texture2D(portal, clamp(gl_FragCoord.xy / max(portalRes, vec2(1.0)), 0.0, 1.0)).rgb;
    if (!(max(k.r, max(k.g, k.b)) < 6.0e4) || !(min(k.r, min(k.g, k.b)) > -1.0)) k = vec3(0.0);
    vec3 deep = ungradeHDR(k * glow);
    // the glass stays a tube for a moment: its scanlines fade out as the depth opens
    float glass = mix(sc, 1.0, depth);
    gl_FragColor = vec4(mix(tube, deep * glass, depth), 1.0);
  }`;

export function makeTunnelMaterial(crt) {
  const cu = crt.uniforms;
  const u = { map: { value: cu.map.value }, portal: { value: null }, portalRes: { value: new THREE.Vector2(1, 1) }, time: { value: 0 }, depth: { value: 0 }, glow: { value: 1 } };
  for (const k of ['brightness', 'curve', 'scan', 'scanCount', 'grille', 'vignette', 'chroma', 'roll', 'noise']) u[k] = { value: cu[k].value * (k === 'brightness' ? cu.flicker.value * cu.power.value : 1) };
  // the grade's inverse: shared with the glass when the tube has one (the seven's), off for a plain js/crt.js tube
  Object.assign(u, cu.gradeOn ? { gradeExposure: cu.gradeExposure, gradeFilter: cu.gradeFilter, gradeOn: cu.gradeOn, gradeO: cu.gradeO, gradeI: cu.gradeI }
    : { ...gradeUniforms(null), gradeOn: { value: 0 } });
  return new THREE.ShaderMaterial({ vertexShader: tunnelVert, fragmentShader: tunnelFrag, uniforms: u, fog: false });
}

// ============================================================================ the coin door and the token
// The cabinet had no coin door; it gets a plain one (no maker's plate, no price): two lit coin entries, the coin return below.
// The return is a real opening in the door, so the token can rise into it from inside. Built in the cabinet's frame: origin at
// the foot of its front face, +Z out of the face, +Y up.
const TOKEN_R = 0.017, TOKEN_H = 0.0032;
const HELD = [0.058, -0.083, -0.2];          // where the token sits in your hand: low and right of centre, under the words
function buildCoinDoor() {
  const door = new THREE.Group(); door.name = 'NamelessCoinDoor';
  const steel = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.035, 0.035, 0.04), metalness: 0.5, roughness: 0.36, name: 'M_CoinDoor' });
  const chrome = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.16, 0.16, 0.17), metalness: 0.6, roughness: 0.25, name: 'M_CoinReturnLip' });
  const inner = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.012, 0.012, 0.015), roughness: 0.9, name: 'M_CoinReturnInside' });
  const lamp = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.46, 0.14).multiplyScalar(0.85), name: 'M_CoinEntryLamp' });
  const slit = new THREE.MeshBasicMaterial({ color: 0x050302, name: 'M_CoinSlit' });
  const glowIn = new THREE.MeshBasicMaterial({ color: new THREE.Color(0, 0, 0), name: 'M_CoinReturnGlow' });
  const box = (w, h, d, mat, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); door.add(m); return m; };
  // the plate: 20 x 26 cm, 1.8 cm proud of the face, between the kick panel and the control panel's lip
  const D = 0.018, W = 0.2, y0 = 0.49, y1 = 0.75;
  const hole = { x0: -0.028, x1: 0.028, y0: 0.515, y1: 0.568 };
  box(W, hole.y0 - y0, D, steel, 0, (y0 + hole.y0) / 2, D / 2);                                  // below the return
  box(W, y1 - hole.y1, D, steel, 0, (hole.y1 + y1) / 2, D / 2);                                  // above it
  box(hole.x0 + W / 2, hole.y1 - hole.y0, D, steel, (-W / 2 + hole.x0) / 2, (hole.y0 + hole.y1) / 2, D / 2);
  box(W / 2 - hole.x1, hole.y1 - hole.y0, D, steel, (hole.x1 + W / 2) / 2, (hole.y0 + hole.y1) / 2, D / 2);
  box(hole.x1 - hole.x0, hole.y1 - hole.y0, 0.002, inner, 0, (hole.y0 + hole.y1) / 2, 0.001);   // the back of the return
  const glow = box(hole.x1 - hole.x0 - 0.004, 0.006, 0.001, glowIn, 0, hole.y0 + 0.004, 0.003); // a lamp inside it, off until the token
  // a lip around the return, and one lit coin entry above it
  box(0.07, 0.006, 0.008, chrome, 0, hole.y0 - 0.003, D + 0.004); box(0.07, 0.004, 0.005, chrome, 0, hole.y1 + 0.002, D + 0.0025);
  box(0.004, hole.y1 - hole.y0, 0.005, chrome, hole.x0 - 0.002, (hole.y0 + hole.y1) / 2, D + 0.0025);
  box(0.004, hole.y1 - hole.y0, 0.005, chrome, hole.x1 + 0.002, (hole.y0 + hole.y1) / 2, D + 0.0025);
  box(0.024, 0.038, 0.004, lamp, 0, 0.672, D + 0.002);
  box(0.003, 0.024, 0.002, slit, 0, 0.674, D + 0.0045);
  return { door, glow, hole, D };
}
// the token's face: the Gate (gateMarkSVG from js/marks.js when it is there; the placeholder coin art until then) on brass
function faceCanvas() {
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const g = c.getContext('2d');
  const brass = () => {
    const rg = g.createRadialGradient(200, 180, 30, 256, 256, 260);
    rg.addColorStop(0, '#d8bd7c'); rg.addColorStop(0.6, '#a88a4a'); rg.addColorStop(1, '#6a5428');
    g.fillStyle = rg; g.fillRect(0, 0, 512, 512);
    g.lineWidth = 18; g.strokeStyle = 'rgba(60, 38, 12, 0.55)'; g.beginPath(); g.arc(256, 256, 236, 0, Math.PI * 2); g.stroke();
    g.lineWidth = 6; g.strokeStyle = 'rgba(255, 226, 160, 0.35)'; g.beginPath(); g.arc(256, 256, 224, 0, Math.PI * 2); g.stroke();
  };
  brass();
  return { c, g, brass };
}
function gateSVGImage() {
  if (typeof MARKS.gateMarkSVG !== 'function') return null;
  try {
    const doc = new DOMParser().parseFromString(MARKS.gateMarkSVG(), 'image/svg+xml');
    const svg = doc.documentElement;
    if (!svg || svg.nodeName.toLowerCase() !== 'svg') return null;
    svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg'); svg.setAttribute('width', '512'); svg.setAttribute('height', '512');
    svg.setAttribute('color', '#3a2408');
    const st = doc.createElementNS('http://www.w3.org/2000/svg', 'style');
    st.textContent = '*{vector-effect:none} .s,.stroke,.line{fill:none;stroke:currentColor} .road,.fill,.stars,.star,.dots,.dot{fill:currentColor}';
    svg.insertBefore(st, svg.firstChild);
    const img = new Image();
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(svg));
    return img;
  } catch (e) { console.warn('[ending] gateMarkSVG', e); return null; }
}

// ============================================================================ the sequence
// ctx: { O, camera, renderer, pipe, screen (the tube: {mesh, material, center, normal, size}), tube (the cabinet's tube:
//        js/cabinet/seven's SevenScreen; only tube.t, the texture on the glass, is read), listener, buffers, line(text, secs),
//        setPrompt(text), onEnd() }
const LINES = [
  [0.8, 2.9, 'You beat it.'],
  [4.3, 2.9, 'That was the test.'],
  [8.0, 3.5, 'They come for the ones who beat it.'],
  [12.6, 4.9, "It wasn't controlling you. It was showing you the map."],
];
const LINES_END = 17.5;          // the pull begins as the last line leaves
const WARP_GLOW = new THREE.Color(0.62, 0.72, 1.0);
export class Ending {
  constructor(ctx) {
    this.ctx = ctx; this.phase = 'idle'; this.t = 0; this.T = 0; this.vlog = []; this.sched = []; this.linesEnd = LINES_END;
    const scr = ctx.screen;
    this.C = scr.center.clone(); this.N = scr.normal.clone().normalize();
    this.Tn = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), this.N).normalize();
    this.Bn = new THREE.Vector3().crossVectors(this.N, this.Tn).normalize();
    // the cabinet's frame, from its body (js/delivery.js stands it at PolybiusSpot/Visual); its front face at the coin door
    const O = ctx.O, body = new THREE.Box3();
    for (const m of O.byPath['Outside/Flynns/FlynnsInterior/PolybiusSpot/Visual/PolybiusCab/CabBody'] || []) {
      const g = m.geometry; if (!g.boundingBox) g.computeBoundingBox(); body.union(g.boundingBox.clone().applyMatrix4(m.matrix));
    }
    this.floorY = body.isEmpty() ? this.C.y - 1.18 : body.min.y;
    this.frontZ = this.faceAt(O, 0.62) ?? (body.isEmpty() ? this.C.z + 0.48 : body.max.z - 0.07);
    this.cx = this.C.x;
    // ---- the coin door and the token (hidden until the cabinet is placed; the token until the win)
    const cd = buildCoinDoor();
    this.door = cd.door; this.returnGlow = cd.glow; this.hole = cd.hole;
    this.door.position.set(this.cx, this.floorY, this.frontZ); this.door.visible = false; O.group.add(this.door);
    this.face = faceCanvas();
    this.faceTex = new THREE.CanvasTexture(this.face.c); this.faceTex.colorSpace = THREE.SRGBColorSpace; this.faceTex.anisotropy = 4;
    const rim = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.62, 0.50, 0.26), metalness: 0.45, roughness: 0.36, emissive: new THREE.Color(0.08, 0.06, 0.03), name: 'M_TokenRim' });
    const faceM = new THREE.MeshStandardMaterial({ map: this.faceTex, color: new THREE.Color(0.92, 0.9, 0.82), metalness: 0.3, roughness: 0.42, emissive: new THREE.Color(1, 1, 1), emissiveMap: this.faceTex, emissiveIntensity: 0.12, name: 'M_TokenFace' });
    // the face (the top cap) toward +Z, and turned so the picture stands upright (the cap's UVs run along its x and z)
    const geo = new THREE.CylinderGeometry(TOKEN_R, TOKEN_R, TOKEN_H, 48, 1); geo.rotateX(Math.PI / 2); geo.rotateZ(Math.PI / 2);
    this.token = new THREE.Mesh(geo, [rim, faceM, faceM]); this.token.name = 'GateToken';
    this.faceM = faceM;
    this.restLocal = new THREE.Vector3(0, (cd.hole.y0 + cd.hole.y1) / 2 + 0.001, cd.D * 0.55);
    this.token.position.copy(this.restLocal).setY(cd.hole.y0 - TOKEN_R - 0.004); this.token.visible = false; this.door.add(this.token);
    this._drawFace();
    // ---- the tunnel, on the tube's own mesh when the pull begins
    this.tunnel = makeTunnelMaterial(scr.material);
    const tu = this.tunnel.uniforms;
    // the screen's own size, measured in its plane: the tunnel is a hair smaller than its height
    const pos = scr.mesh.geometry.attributes.position, v = new THREE.Vector3(); let hw = 0, hh = 0;
    for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i).applyMatrix4(scr.mesh.matrix).sub(this.C); hw = Math.max(hw, Math.abs(v.dot(this.Tn))); hh = Math.max(hh, Math.abs(v.dot(this.Bn))); }
    this.half = new THREE.Vector2(hw || 0.24, hh || 0.18);
    // ---- the warp (js/warp.js): its own scene, seen through the glass, then full screen; turned back through the room's grade
    this.warp = new Warp(ctx.renderer, { gradeExposure: tu.gradeExposure, gradeFilter: tu.gradeFilter, gradeOn: tu.gradeOn, gradeO: tu.gradeO, gradeI: tu.gradeI });
    tu.portal.value = null;
    this.flow = 0; this.through = false;
    // the tube's frame (its right, up and out), so the warp's camera can stand where you stand relative to the glass
    this.frameQ = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(this.Tn, this.Bn, this.N));
    this.frameQi = this.frameQ.clone().invert();
    this.glowDef = O.byName.PolyGlow || null;
    // THE PATH for the pull, built now and painted once at an invisible opacity (at load, not in the rush: parsing the SVG and
    // painting its glow the first time costs a long frame)
    this.flash = document.getElementById('pathflash');
    if (this.flash) {
      this.flash.innerHTML = MARKS.pathMarkSVG().replace(/pmReveal/g, 'pfReveal').replace(/pmRing/g, 'pfRing');
      this.flash.style.opacity = '0.004';
      setTimeout(() => { this.flash.style.opacity = ''; }, 1500);
    }
  }
  // z of the cabinet's front face at a height above the floor (the body's mesh, near the middle)
  faceAt(O, h) {
    let best = null; const v = new THREE.Vector3();
    for (const m of O.byPath['Outside/Flynns/FlynnsInterior/PolybiusSpot/Visual/PolybiusCab/CabBody'] || []) {
      const pos = m.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(m.matrix);
        if (Math.abs(v.x - this.C.x) < 0.25 && Math.abs(v.y - (this.floorY ?? v.y) - h) < 0.12 && (best === null || v.z > best)) best = v.z;
      }
    }
    return best;
  }
  _drawFace() {
    const F = this.face, g = F.g;
    if (typeof MARKS.drawGateMark === 'function') {
      // THE GATE in relief on the brass: its shadow, then the raised stamp with a dark edge (js/marks.js drawGateMark)
      try {
        const size = 116, cx = 256, cy = 256 + 0.14 * size;
        F.brass();
        g.save(); g.beginPath(); g.arc(256, 256, 226, 0, Math.PI * 2); g.clip();
        MARKS.drawGateMark(g, cx + 4, cy + 5, size, { progress: 0, fill: 1, fillColor: 'rgba(36, 20, 4, 0.72)' });
        MARKS.drawGateMark(g, cx, cy, size, { progress: 1, fill: 1, fillColor: '#e9c982', color: 'rgba(72, 44, 12, 0.9)', lineWidth: 2.6 });
        MARKS.drawGateMark(g, cx - 1.5, cy - 1.5, size, { progress: 1, fill: 0, color: 'rgba(255, 244, 205, 0.35)', lineWidth: 1.2 });
        g.restore();
        this.faceTex.needsUpdate = true; this.faceSource = 'drawGateMark';
        if (this.ctx.renderer) this.ctx.renderer.initTexture(this.faceTex);
        return;
      } catch (e) { console.warn('[ending] drawGateMark', e); }
    }
    const gate = gateSVGImage();
    const paint = (img, engraved) => {
      F.brass();
      g.save(); g.beginPath(); g.arc(256, 256, 226, 0, Math.PI * 2); g.clip();
      if (engraved) {
        // the Gate stamped into the brass: a light edge below-right, the cut above-left
        g.globalAlpha = 0.5; g.filter = 'brightness(4) sepia(1)'; g.drawImage(img, 70, 72, 372, 372); g.filter = 'none';
        g.globalAlpha = 0.9; g.drawImage(img, 66, 66, 372, 372); g.globalAlpha = 1;
      } else g.drawImage(img, 0, 0, 512, 512);
      g.restore();
      this.faceTex.needsUpdate = true;
      if (this.ctx.renderer) this.ctx.renderer.initTexture(this.faceTex);
    };
    if (gate) { gate.onload = () => paint(gate, true); gate.onerror = () => this._facePlaceholder(paint); this.faceSource = 'gateMarkSVG'; }
    else this._facePlaceholder(paint);
  }
  _facePlaceholder(paint) {
    const img = loadImage('assets/art/end_token_gate.jpg');
    img.onload = () => paint(img, false);
    this.faceSource = 'placeholder';
  }
  // what main.js's precompile must see drawn once: the door, the token, the tunnel on the tube
  warm() {
    const scr = this.ctx.screen, keep = { door: this.door.visible, token: this.token.visible, mesh: scr.mesh.visible, mat: scr.mesh.material };
    this.door.visible = true; this.token.visible = true; scr.mesh.visible = true; scr.mesh.material = this.tunnel;
    this.tunnel.uniforms.map.value = this.ctx.tube.t;
    try { const rt = this.ctx.pipe && this.ctx.pipe.rtScene; this.warp.warm(rt ? rt.width : 64, rt ? rt.height : 36, rt || null); this.tunnel.uniforms.portal.value = this.warp.texture; } catch (e) { console.warn('[ending] warp warm-up', e); }
    return () => { this.door.visible = keep.door; this.token.visible = keep.token; scr.mesh.visible = keep.mesh; scr.mesh.material = keep.mat; };
  }
  placed() { this.door.visible = true; }
  get busy() { return this.phase !== 'idle'; }
  state() {
    const w = this.warpInfo;
    return { phase: this.phase, t: +this.t.toFixed(2), T: +this.T.toFixed(2), face: this.faceSource, fov: +this.ctx.camera.fov.toFixed(1),
      warp: w ? { beat: w.beat, through: this.through, speed: +w.speed.toFixed(2), lens: +w.lensQ.toFixed(3), rings: +w.ringQ.toFixed(3), bloom: +w.bloom.toFixed(3) } : null, voices: this.vlog.slice() };
  }
  // what main.js draws this frame in place of the arcade: once you are through the glass, the warp full screen
  view() { return this.through ? { scene: this.warp.blitScene, camera: this.warp.blitCam } : null; }

  // ------------------------------------------------------------------ the beats
  begin() {
    if (this.phase !== 'idle') return;
    const cam = this.ctx.camera;
    this.from = { p: cam.position.clone(), q: cam.quaternion.clone() };
    this.phase = 'won'; this.t = 0; this.T = 0;
    this.ctx.setPrompt(null);
  }
  take() {
    if (this.phase !== 'offer') return false;
    this.ctx.setPrompt(null);
    this.phase = 'take'; this.t = 0;
    this.takeFrom = { p: this.token.getWorldPosition(new THREE.Vector3()), q: this.token.getWorldQuaternion(new THREE.Quaternion()) };
    this.camFrom = { p: this.ctx.camera.position.clone(), q: this.ctx.camera.quaternion.clone() };
    this.O().group.attach(this.token);
    return true;
  }
  O() { return this.ctx.O; }
  // standing, square to the tube, at d metres along its normal
  pose(d) {
    const p = this.C.clone().addScaledVector(this.N, d);
    const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(p, this.C, new THREE.Vector3(0, 1, 0)));
    return { p, q };
  }
  coinPose() {
    const k = this.door.localToWorld(this.restLocal.clone());
    const p = k.clone().add(new THREE.Vector3(0, 0.3, 0.36));
    const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(p, k.clone().add(new THREE.Vector3(0, 0.045, 0)), new THREE.Vector3(0, 1, 0)));
    return { p, q };
  }
  setCam(p, q, fov) {
    const cam = this.ctx.camera;
    cam.position.copy(p); cam.quaternion.copy(q);
    if (fov !== undefined && Math.abs(cam.fov - fov) > 1e-4) { cam.fov = fov; cam.updateProjectionMatrix(); }
  }
  blendCam(a, b, k, fov) { this.setCam(a.p.clone().lerp(b.p, k), a.q.clone().slerp(b.q, k), fov); }
  heldPose() {
    const cam = this.ctx.camera;
    const p = new THREE.Vector3(HELD[0], HELD[1], HELD[2]).applyQuaternion(cam.quaternion).add(cam.position);
    const q = cam.quaternion.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.3, 0.16, 0.05)));
    return { p, q };
  }
  // the four lines' timetable. With a recording (assets/audio/voice/E1..E4.ogg) the caption stays for its length and a line never starts
  // before the one before has finished; with none, LINES stands exactly as written.
  schedule() {
    this.sched = []; let prev = 0, any = false;
    LINES.forEach(([at, secs, text], i) => {
      const clip = (this.ctx.buffers || {})['voice/E' + (i + 1) + '.ogg'] || null;
      if (clip) any = true;
      const start = clip ? Math.max(at, prev + 0.5) : at, cap = clip ? clip.duration + 0.6 : secs;
      this.sched.push({ at: start, secs: cap, text, clip: clip ? 'voice/E' + (i + 1) + '.ogg' : null }); prev = start + cap;
    });
    this.linesEnd = any ? Math.max(prev, LINES_END - 1.5) : LINES_END;
  }
  play(name, gain, rate = 1, loop = false) {
    const buf = this.ctx.buffers[name]; if (!buf) return null;
    try {
      const a = new THREE.Audio(this.ctx.listener); a.setBuffer(buf); a.setVolume(gain); a.setPlaybackRate(rate); a.setLoop(loop); a.play();
      return a;
    } catch (e) { return null; }
  }
  update(dt) {
    if (this.phase === 'idle' || this.phase === 'end') return;
    this.t += dt; this.T += dt;
    const t = this.t, tu = this.tunnel.uniforms;
    tu.time.value += dt;
    switch (this.phase) {
      case 'won': {                               // the tube holds its last picture (the passage); a breath, then the clunk
        if (t >= 0.9) { this.phase = 'clunk'; this.t = 0; this.play('token_clunk.mp3', 0.9); }
        break;
      }
      case 'clunk': {                             // down to the coin return, and the token rises into it
        const coin = this.coinPose();
        this.blendCam(this.from, coin, ease(t / 1.4), 60);
        const rise = clamp01((t - 0.55) / 1.1);
        if (t > 0.5) this.token.visible = true;
        const settle = rise < 1 ? 1 - Math.pow(1 - rise, 3) : 1;
        const y0 = this.hole.y0 - TOKEN_R - 0.004, y1 = this.restLocal.y;
        this.token.position.set(this.restLocal.x, y0 + (y1 - y0) * settle + Math.sin(rise * Math.PI) * 0.002, this.restLocal.z);
        this.token.rotation.set(0, 0, Math.sin(t * 2.1) * 0.05 * (1 - rise));
        this.returnGlow.material.color.setRGB(1.0, 0.62, 0.28).multiplyScalar(0.4 * smooth((t - 0.5) / 0.8));
        this.faceM.emissiveIntensity = 0.12 + 0.3 * Math.exp(-Math.pow((t - 1.9) / 0.45, 2));   // one slow glint as it settles
        if (t >= 2.2) { this.phase = 'offer'; this.t = 0; this.ctx.setPrompt('TAKE THE TOKEN'); }
        break;
      }
      case 'offer': {                             // it waits for you
        this.setCam(this.coinPose().p, this.coinPose().q, 60);
        this.faceM.emissiveIntensity = 0.12 + 0.05 * Math.sin(this.T * 1.3);
        break;
      }
      case 'take': {                              // lift it; stand up with it, facing the tube
        const k = ease(t / 1.5);
        this.blendCam(this.camFrom, this.pose(0.95), k, 60);
        const held = this.heldPose(), kt = smooth(t / 1.3);
        this.token.position.copy(this.takeFrom.p).lerp(held.p, kt); this.token.position.y += Math.sin(kt * Math.PI) * 0.05;
        this.token.quaternion.copy(this.takeFrom.q).slerp(held.q, kt);
        this.returnGlow.material.color.multiplyScalar(0.96);
        if (t >= 1.6) { this.ctx.camera.attach(this.token); this.phase = 'lines'; this.t = 0; this.said = 0; this.schedule(); }
        break;
      }
      case 'lines': {                             // the token in your hand; the words; the tube starts to open on the last one
        const stand = this.pose(0.95 - Math.min(t, this.linesEnd) * 0.004);
        this.setCam(stand.p, stand.q, 60);
        this.wobble(t);
        while (this.said < this.sched.length && t >= this.sched[this.said].at) {
          const L = this.sched[this.said++]; this.ctx.line(L.text, L.secs);
          if (L.clip && this.play(L.clip, 1)) this.vlog.push({ id: 'E' + this.said, at: +t.toFixed(2), secs: +this.ctx.buffers[L.clip].duration.toFixed(2) });
        }
        const d0 = this.sched[3].at + 1.4;
        if (t >= d0 && this.ctx.screen.mesh.material !== this.tunnel) this.openTube();
        if (t >= d0) { tu.depth.value = 0.3 * smooth((t - d0) / 3.0); this.drive(dt, 'glimpse', 0.25, 0); }
        if (t >= this.linesEnd) { this.phase = 'pull'; this.t = 0; this.pullFrom = stand; this.startPull(); }
        break;
      }
      case 'pull': this.updatePull(dt); break;
      case 'white': {
        this.drive(dt, 'white', this.warpInfo ? this.warpInfo.speed : 12, WARP_LEN);
        if (this.hum) this.hum.setVolume(Math.max(0, this.humVol * (1 - t / 1.5)));
        if (t >= 3.0) { this.phase = 'end'; if (this.hum) { try { this.hum.stop(); } catch (e) { /* stopped */ } } this.ctx.onEnd(); }
        break;
      }
    }
  }
  wobble(t) {                                     // the token turns a little in your fingers, catching the light
    this.token.position.set(HELD[0], HELD[1] + Math.sin(t * 0.9) * 0.002, HELD[2]);
    this.token.quaternion.setFromEuler(new THREE.Euler(-0.3 + Math.sin(t * 0.7) * 0.05, 0.16 + Math.sin(t * 0.5) * 0.12, 0.05));
    this.faceM.emissiveIntensity = 0.14 + 0.06 * Math.max(0, Math.sin(t * 0.5));
  }
  openTube() {
    const mesh = this.ctx.screen.mesh;
    this.tunnel.uniforms.map.value = this.ctx.tube.t;
    this.tunnel.uniforms.time.value = this.ctx.screen.material.uniforms.time.value;
    mesh.material = this.tunnel;
  }
  startPull() {
    this.humVol = 0.45;
    this.hum = this.play('handshake/crt_hum.mp3', 0.0, 0.5, true);
    if (this.glowDef) this.glowBase = { i: this.glowDef.intensity, r: this.glowDef.range, c: this.glowDef.color.clone() };
    this.ctx.camera.near = 0.008; this.ctx.camera.updateProjectionMatrix();
  }
  // THE PULL: the depth opens (0-3 s); the arcade stretches, a dolly-zoom out to a wide lens with the tube held the same size
  // (0.6-5.6 s); you are drawn into the glass (5.6-9 s), THE PATH once (7.3 s, 0.6 s); then THROUGH (9 s): the warp full screen,
  // time rushing past, THE GATE's rings flying by, the lens opening until the light takes everything (9-15 s); white at 15 s.
  updatePull(dt) {
    const t = this.t, tu = this.tunnel.uniforms;
    tu.depth.value = 0.3 + 0.7 * smooth(t / 3.0);
    // the token drops out of your hand's frame
    const drop = smooth(t / 1.2);
    if (this.token.parent === this.ctx.camera) {
      this.token.position.y = HELD[1] - drop * 0.12; this.token.visible = drop < 1;
    }
    // the camera: the dolly-zoom, then in
    const fov0 = 60, fov1 = 106, d0 = 0.95 - this.linesEnd * 0.004;
    const kz = ease((t - 0.6) / 5.0);
    const fov = fov0 + (fov1 - fov0) * kz;
    const dz = d0 * Math.tan(fov0 * DEG / 2) / Math.tan(fov * DEG / 2);
    const kin = drawIn((t - 5.6) / (THROUGH - 5.6));
    const d = dz * Math.pow(0.045 / dz, kin);          // in by ratios: the glass grows ever faster, the bezel last to go
    if (t < THROUGH) { const p = this.pose(d); this.setCam(p.p, p.q, fov); }
    // the cabinet's glow takes the warp's cold light, and grows (it is one of the pool's lights: nothing is added)
    if (this.glowDef && this.glowBase) {
      const g = this.glowDef, k = smooth(t / 4.0);
      g.color.copy(this.glowBase.c).lerp(WARP_GLOW, k * 0.8);
      g.intensity = this.glowBase.i * (1 + 0.6 * k); g.range = this.glowBase.r + 0.5 * k;
    }
    // the cabinet's hum, drawn up with you, and higher as time rushes
    if (this.hum) { this.hum.setVolume(this.humVol * smooth(t / 2.5)); this.hum.setPlaybackRate(0.5 + 0.45 * smooth(t / 9) + 0.35 * smooth((t - THROUGH) / 5)); }
    // THE PATH: once, flat, 0.6 s, a soft fade in and out
    if (t >= 7.3 && !this.flashed) { this.flashed = true; this.showPath(); }
    // time rushing: slow through the glass, then hard once you are in it
    const tw = t - THROUGH;
    const speed = warpSpeed(t);
    if (tw >= 0 && !this.through) this.through = true;
    this.drive(dt, tw < 0 ? (t < 5.6 ? 'opening' : 'sucked') : (tw < 2.8 ? 'rush' : 'light'), speed, tw);
    // the light takes everything: the grade fades to white under it, so the hand-off is clean white
    const u = this.ctx.pipe.mFinal.uniforms;
    // (the burst itself whites the frame; the grade only closes the last 0.15 s, and its vignette lifts as the light grows)
    if (this.vigBase === undefined) this.vigBase = u.vignette.value;
    if (this.warpInfo) u.vignette.value = this.vigBase * (1 - smooth(this.warpInfo.bloom / 0.8));
    if (tw >= WARP_LEN - 0.15) { u.fadeCol.value.set(1, 1, 1); u.fade.value = smooth((tw - (WARP_LEN - 0.15)) / 0.15); }
    if (tw >= WARP_LEN) { u.fade.value = 1; this.phase = 'white'; this.t = 0; }
  }
  // the warp, one frame: its state from the beat, its camera from yours (through the glass) or held (once through), drawn
  drive(dt, beat, speed, tw) {
    const W = this.warp, cam = this.ctx.camera, pipe = this.ctx.pipe;
    this.flow += speed * dt;
    let glassQ = this.glassQ || this.half.y / 0.95, pose = this.warpPose;
    if (!this.through) {
      // where you stand, in the tube's frame (x right, y up, z out of the glass)
      const rel = cam.position.clone().sub(this.C);
      const p = new THREE.Vector3(rel.dot(this.Tn), rel.dot(this.Bn), rel.dot(this.N));
      glassQ = this.glassQ = this.half.y / Math.max(p.z, 0.02);
      pose = this.warpPose = { position: p, quaternion: this.frameQi.clone().multiply(cam.quaternion), fov: cam.fov, aspect: cam.aspect };
    }
    const look = warpLook(tw, glassQ, speed);
    W.set({ ...look, time: this.T, flow: this.flow, clipZ: this.through ? 1e3 : 0, glow: 1 });
    const w = pipe.rtScene ? pipe.rtScene.width : 640, h = pipe.rtScene ? pipe.rtScene.height : 360;
    W.render(pose, w, h);
    const tu = this.tunnel.uniforms;
    tu.portal.value = W.texture; tu.portalRes.value.set(w, h);
    this.warpInfo = { beat, ...look };
  }
  showPath() {
    const el = this.flash; if (!el) return;
    el.style.opacity = '';
    el.classList.add('on');
    this.flashAt = performance.now();
    setTimeout(() => el.classList.remove('on'), 420);        // with the 0.18 s fades: about 0.6 s on screen, once
    setTimeout(() => { el.innerHTML = ''; }, 1400);
  }
}
