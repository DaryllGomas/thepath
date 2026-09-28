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

// ---- THE NODE BBS // EST. 1982 (BBSBoard.cs), drawn at 640x480 so it reads when you lean in
export const BBS_POSTS = [
  'the board is quiet. beat one of ours and check back.',
  '> new post: a black van outside the Junction twice this week. guys in suits. they took the score cards off the wall and left.',
  '> new post: they wheeled a cabinet in the back by the arch. no title on it. slow starfield. eats quarters. nobody\'s beaten it.',
  '> new post: danny beat it. he doesn\'t come around anymore. nobody says hurt. nobody says anything. GO TO THE JUNCTION. it takes your quarter now. — A·V·R',
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
  read(index) { this.active = true; this.text = BBS_POSTS[index]; this.shown = 0; this.m.uniforms.blend.value = 0; }
  close() { this.active = false; }
  get typing() { return this.active && this.shown < this.text.length; }
  finish() { this.shown = this.text.length; }
  update(dt) {
    this.time += dt;
    if (!this.active) { this.idle.update(dt); return; }
    if (this.shown < this.text.length) this.shown += 30 * dt;
    const g = this.g, W = 640, H = 480, M = 26;
    g.fillStyle = '#0a0602'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#96601a'; g.fillRect(0, 0, W, 34);
    g.font = '30px VT323, monospace'; g.textBaseline = 'top';
    g.fillStyle = '#0a0602'; g.fillText('THE NODE BBS // EST. 1982', M, 4);
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
    g.fillText(this.typing ? '' : '[BACKSPACE] LOG OFF', M, H - 40);
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
export class Cabinet {
  constructor(material, id, title, frames, runtime) {
    this.m = material; this.id = id; this.title = title;
    this.runner = null; this.slides = null;
    this.c = document.createElement('canvas'); this.c.width = 320; this.c.height = 240;
    this.g = this.c.getContext('2d');
    this.t = new THREE.CanvasTexture(this.c); this.t.colorSpace = THREE.SRGBColorSpace;
    this.t.magFilter = THREE.NearestFilter; this.t.minFilter = THREE.LinearFilter; this.t.generateMipmaps = false;
    const cart = runtime && runtime.get(id);
    if (cart) {
      // home cabinets are on free play; each keeps its own mercy ledger, like the Unity CoinCabinet
      this.runner = new runtime.CabinetRunner(cart, { cabinetId: 'home_' + id, freePlay: true });
      this.img = new ImageData(this.runner.surface.data, 320, 240);
      this.won = (result, info) => result === runtime.RoundResult.Won && !(info && info.aborted);
    } else {
      this.slides = new Slides(material, frames, 2.5, 0.35);
    }
    this.playing = false; this.onOver = null;
  }
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
    this.runner.step(dt, input || { x: 0, y: 0, a: false, b: false, start: false });
    if (!this.runner.dirty && this.shown) return;
    this.shown = true;
    this.g.putImageData(this.img, 0, 0);
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
