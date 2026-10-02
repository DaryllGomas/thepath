// What the five tubes show: the TV (crossfading frames), THE NODE BBS (typed posts), and the three cabinets
// (live games from js/cabinet when the cartridge exists, the old play frames when it does not).
import * as THREE from 'three';

const loader = new THREE.TextureLoader();
function tex(url, nearest) {
  const t = loader.load(url); t.colorSpace = THREE.SRGBColorSpace;
  if (nearest) { t.magFilter = THREE.NearestFilter; }
  return t;
}

// ---- a slideshow: the TV, the BBS at idle, and a cabinet with no cartridge yet
export class Slides {
  constructor(material, urls, hold = 4, fade = 1.2) {
    this.m = material; this.frames = urls.map((u) => tex(u)); this.hold = hold; this.fade = fade; this.t = 0; this.i = 0;
    this.m.uniforms.map.value = this.frames[0]; this.m.uniforms.nextMap.value = this.frames[1 % this.frames.length];
  }
  update(dt) {
    this.t += dt;
    const per = this.hold + this.fade;
    if (this.t > per) { this.t -= per; this.i = (this.i + 1) % this.frames.length; }
    const u = this.m.uniforms;
    u.map.value = this.frames[this.i]; u.nextMap.value = this.frames[(this.i + 1) % this.frames.length];
    u.blend.value = Math.max(0, (this.t - this.hold) / this.fade);
  }
}

// ---- THE NODE BBS // EST. 1982 (BBSBoard.cs), drawn at 640x480 so it reads when you lean in. Three posts, all there when you
// wake; E steps through them. (9/30: the old van / no-name cabinet / "danny beat it" posts told the story before the new
// trigger; they're kept in docs/THE_PLAN/IDEAS_VAULT.md.)
export const BBS_POSTS = [
  "> sat: who's going downtown tonight? the Junction's open till midnight. — MIKEY",
  "> every high score at the Junction's been taken. every one except Starvector. #1 is blank. always has been.",
  "> starvector. top the board. they'll notice. — A·V·R",
];
export class BBS {
  constructor(material) {
    this.m = material;
    this.c = document.createElement('canvas'); this.c.width = 640; this.c.height = 480;
    this.g = this.c.getContext('2d');
    this.t = new THREE.CanvasTexture(this.c); this.t.colorSpace = THREE.SRGBColorSpace; this.t.magFilter = THREE.NearestFilter;
    this.idle = new Slides(material, ['assets/art/bbs_screen.jpg', 'assets/art/bbs_screen_a.jpg'], 5, 1.5);
    this.active = false; this.text = ''; this.shown = 0; this.time = 0;
  }
  read(index) { this.active = true; this.index = index; this.text = BBS_POSTS[index]; this.shown = 0; this.m.uniforms.blend.value = 0; }
  get more() { return this.index < BBS_POSTS.length - 1; }
  close() { this.active = false; }
  get typing() { return this.active && this.shown < this.text.length; }
  finish() { this.shown = this.text.length; }
  // THE FLASH (js/flashes.js decides when; once a session): the tube loses vertical hold and rolls once; for 0.2 s in the middle
  // of the roll the raster forms THE PATH's axis and curve (markImg, in the tube's own phosphor); then it is itself again
  flash(markImg) { if (!this.fx) this.fx = { t: 0, mark: markImg, roll: this.m.uniforms.roll.value }; }
  drawFlash(dt) {
    const F = this.fx; F.t += dt;
    const D = 1.0, T = F.t, u = this.m.uniforms;
    if (T >= D) { u.roll.value = F.roll; this.fx = null; if (this.active) { u.map.value = this.t; u.nextMap.value = this.t; } return; }
    if (!this.fc) {
      this.fc = document.createElement('canvas'); this.fc.width = 640; this.fc.height = 480; this.fg = this.fc.getContext('2d');
      this.ft = new THREE.CanvasTexture(this.fc); this.ft.colorSpace = THREE.SRGBColorSpace;
    }
    const g = this.fg, W = 640, H = 480;
    // what the tube was showing: the post being read, or the idle page
    const src = this.active ? this.c : (this.idle.frames[this.idle.i] && this.idle.frames[this.idle.i].image);
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    const k = T / D, roll = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;   // slips, then catches
    const off = Math.round(roll * H);
    const mid = T > 0.4 && T < 0.6;                 // the 0.2 s
    if (!mid && src) {
      g.globalAlpha = 0.85; g.drawImage(src, 0, off, W, H); g.drawImage(src, 0, off - H, W, H); g.globalAlpha = 1;
      // the blanking bar rolling through
      g.fillStyle = '#000'; g.fillRect(0, off - 18, W, 26);
      g.fillStyle = 'rgba(255,255,255,0.05)'; g.fillRect(0, off + 8, W, 3);
    }
    if (mid && F.mark && F.mark.complete && F.mark.naturalWidth) {
      // the raster, bent into the axis and the curve: drawn a scanline band at a time, each band a little off true
      const s = 400, x0 = (W - s) / 2, y0 = (H - s) / 2 + ((off % 40) - 20) * 0.3;
      for (let y = 0; y < s; y += 4) {
        const jx = Math.round(Math.sin((y + T * 900) * 0.07) * 2.5);
        g.drawImage(F.mark, 0, (y / s) * F.mark.naturalHeight, F.mark.naturalWidth, (4 / s) * F.mark.naturalHeight, x0 + jx, y0 + y, s, 3);
      }
    }
    this.ft.needsUpdate = true;
    u.map.value = this.ft; u.nextMap.value = this.ft; u.blend.value = 0;
    u.roll.value = F.roll + 0.5 * Math.sin(Math.PI * k);
  }
  update(dt) {
    this.time += dt;
    if (this.fx) { if (this.active && this.shown < this.text.length) this.shown += 30 * dt; this.drawFlash(dt); return; }
    if (!this.active) { this.idle.update(dt); return; }
    if (this.shown < this.text.length) this.shown += 30 * dt;
    const g = this.g, W = 640, H = 480, M = 26;
    g.fillStyle = '#0a0602'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#96601a'; g.fillRect(0, 0, W, 34);
    g.font = '30px VT323, monospace'; g.textBaseline = 'top';
    g.fillStyle = '#0a0602'; g.fillText('THE NODE BBS // EST. 1982', M, 4);
    g.textAlign = 'right'; g.fillText((this.index + 1) + '/' + BBS_POSTS.length, W - M, 4); g.textAlign = 'left';
    g.fillStyle = '#ffb028'; g.font = '40px VT323, monospace';
    const lines = wrap(this.text, 28);
    let n = Math.floor(this.shown), y = 58, cx = M, cy = y;
    for (const line of lines) {
      const take = Math.max(0, Math.min(n, line.length));
      g.fillText(line.slice(0, take), M, y);
      cx = M + g.measureText(line.slice(0, take)).width; cy = y;
      n -= line.length + 1;
      if (n < 0) break;
      y += 42;
    }
    if (Math.floor(this.time * 2.5) % 2 === 0) g.fillRect(cx + 3, cy + 6, 16, 30);
    g.fillStyle = '#96601a'; g.font = '24px VT323, monospace';
    g.fillText(this.typing ? '' : this.more ? '[E] NEXT POST   [BACKSPACE] LOG OFF' : '[BACKSPACE] LOG OFF', M, H - 40);
    this.t.needsUpdate = true;
    this.m.uniforms.map.value = this.t; this.m.uniforms.nextMap.value = this.t;
  }
}
function wrap(s, cols) {
  const out = []; let cur = '';
  for (const w of s.split(' ')) {
    if (!cur) cur = w; else if (cur.length + 1 + w.length <= cols) cur += ' ' + w; else { out.push(cur); cur = w; }
  }
  if (cur) out.push(cur);
  return out;
}

// ---- a cabinet: runs its cartridge on the tube all the time (attract), or falls back to its play frames
// opts.cabinetId: its own high-score table and mercy ledger (default 'home_' + the game: the home cabinets and the floor's
// copies of them share one table). cab.hold = (dt, input) => {}: while set, the game is not stepped; the hook draws on
// runner.surface (THE ARCADE ANSWERS' freeze and name entry, js/answer.js) and the tube shows it every frame.
const IDLE = { x: 0, y: 0, a: false, b: false, start: false };
export class Cabinet {
  constructor(material, id, title, frames, runtime, opts = {}) {
    this.m = material; this.id = id; this.title = title;
    this.runner = null; this.slides = null;
    this.c = document.createElement('canvas'); this.c.width = 320; this.c.height = 240;
    this.g = this.c.getContext('2d');
    this.t = new THREE.CanvasTexture(this.c); this.t.colorSpace = THREE.SRGBColorSpace;
    this.t.magFilter = THREE.NearestFilter; this.t.minFilter = THREE.LinearFilter; this.t.generateMipmaps = false;
    const cart = runtime && runtime.get(id);
    if (cart) {
      // home cabinets are on free play; each keeps its own mercy ledger, like the Unity CoinCabinet
      this.runner = new runtime.CabinetRunner(cart, { cabinetId: opts.cabinetId || 'home_' + id, freePlay: true });
      this.img = new ImageData(this.runner.surface.data, 320, 240);
      this.won = (result, info) => result === runtime.RoundResult.Won && !(info && info.aborted);
    } else {
      this.slides = new Slides(material, frames, 2.5, 0.35);
    }
    this.playing = false; this.onOver = null; this.overlay = null; this.hold = null;
    // Starvector draws a sharper picture (a second copy of its renderer, js/cabinet/games/starvector/cartridge.js: Sharp) for the
    // full-screen view; on the tube at a distance the cheap 480 x 360 copy is plenty. setSharp(true) swaps the texture to that picture.
    this.sharp = false; this.sharpApi = null;
    if (cart && id === 'starvector') import('./cabinet/games/starvector/cartridge.js').then((m) => { this.sharpApi = m.Sharp; m.Sharp.load(); }).catch(() => {});
  }
  setSharp(on) { const v = !!(on && this.sharpApi && this.sharpApi.mod); if (v !== this.sharp) { this.sharp = v; this.shown = false; } }
  _sharpRenderers() { const r = this.runner; return [r._renderer, r.attract && r.attract._renderer].filter((x) => x && 'sharp' in x); }
  get live() { return !!this.runner; }
  start() {
    if (!this.runner) { this.playing = true; this.fakeT = 0; return true; }
    const ok = this.runner.insertCoin();
    if (ok) {
      this.playing = true;
      this.runner.onRoundOver = (result, summary, info) => { this.playing = false; this.onOver && this.onOver(this.won(result, info), info); };
    }
    return ok;
  }
  abort() {
    if (!this.playing) return;
    if (this.runner) this.runner.abort(); else { this.playing = false; this.onOver && this.onOver(false, null); }
  }
  update(dt, input) {
    if (!this.runner) {
      this.slides.update(dt);
      if (this.playing) { this.fakeT += dt; if (this.fakeT > 10) { this.playing = false; this.onOver && this.onOver(false, null); } }
      return;
    }
    if (this.hold) this.hold(dt, input || IDLE);
    else {
      this.runner.step(dt, input || IDLE);
      if (!this.runner.dirty && this.shown) return;
    }
    this.shown = true;
    this.g.putImageData(this.img, 0, 0);
    if (this.sharpApi) { for (const r of this._sharpRenderers()) { r.sharp = this.sharp; if (this.sharp) r.warm && r.warm(); } }
    if (this.sharp && this.sharpApi.mod) {
      // the full-screen picture: the sharp renderer's frame (or the 320 x 240 pages, scaled), with the overlay drawn over it
      const HI = this.sharpApi.mod.HI;
      if (!this.hc) {
        this.hc = document.createElement('canvas'); this.hc.width = HI.W; this.hc.height = HI.H; this.hg = this.hc.getContext('2d');
        this.ht = new THREE.CanvasTexture(this.hc); this.ht.colorSpace = THREE.SRGBColorSpace; this.ht.magFilter = THREE.LinearFilter; this.ht.minFilter = THREE.LinearFilter; this.ht.generateMipmaps = false;
      }
      if (HI.fresh && HI.surface) { this.himg = this.himg || new ImageData(HI.surface.data, HI.W, HI.H); this.hg.putImageData(this.himg, 0, 0); HI.fresh = false; }
      else { this.hg.imageSmoothingEnabled = false; this.hg.drawImage(this.c, 0, 0, HI.W, HI.H); }
      if (this.overlay) { this.hg.save(); this.hg.scale(HI.W / 320, HI.H / 240); this.overlay(this.hg, this.c); this.hg.restore(); }
      this.ht.needsUpdate = true;
      this.m.uniforms.map.value = this.ht; this.m.uniforms.nextMap.value = this.ht; this.m.uniforms.blend.value = 0;
      this.wasSharp = true;
      return;
    }
    this.wasSharp = false;
    if (this.overlay) this.overlay(this.g, this.c);      // a moment drawn over the tube (js/flashes.js); never the game's own state
    this.t.needsUpdate = true;
    this.m.uniforms.map.value = this.t; this.m.uniforms.nextMap.value = this.t; this.m.uniforms.blend.value = 0;
  }
}

// the cabinet code is written headless in js/cabinet (the SDK port); load it if it is there
export async function loadCabinetRuntime() {
  try {
    const host = await import('./cabinet/host.js');
    const reg = await import('./cabinet/cartridges.js');
    const sdk = await import('./cabinet/sdk/index.js');
    const C = reg.Cartridges || reg.default;
    return { CabinetRunner: host.CabinetRunner, keyboardToInput: host.keyboardToInput, get: (id) => C.get(id), ids: () => C.ids, RoundResult: sdk.RoundResult };
  } catch (e) {
    console.warn('[cabinets] no cartridge runtime yet:', e.message);
    return null;
  }
}
