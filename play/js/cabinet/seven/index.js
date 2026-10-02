// THE CABINET WITH NO NAME · the seven games in one machine, on the delivered cabinet's tube in the arcade (js/main.js).
// It replaces the retired ring puzzle's NamelessScreen (js/ending.js, archived) and speaks the same tube interface:
//
//   const tube = new SevenScreen(renderer)            the arcade's own renderer; every game draws with it
//   tube.prepare(crtMaterial)                         the glass's look for these games (before js/ending.js copies it)
//   tube.warm()                                       make Hearth (and the Constellation) while the van pulls up
//   tube.attach(crtMaterial)                          the cabinet is in: its glass shows the tube from now on
//   tube.coin()                                       a quarter went in (main.js pays it from the pocket): a credit
//   tube.start() / tube.abort()                       you stepped up to it / walked away
//   tube.update(dt)                                   each frame (main.js: full rate while you play, 30 Hz near it otherwise)
//   tube.t                                            the texture on the glass (js/ending.js's tunnel reads it)
//   tube.onOver(true)                                 THE RUN IS WON (the Tunnel's passage): js/ending.js takes it from here
//   tube.needsCoin / canStart / playing / live / frozen / hint / info()
//   tube.setFullScale(s)                              the games draw at s x 1024x768: the glass's real pixels at full screen
//                                                     (main.js works it out from the window; the look kit's renderScale)
//   tube.wantsPointer / pointerAt / pointerMove / pointerButton   the mouse, for a game that takes it (the Constellation)
//
// THE START SCREEN (attract.js, Daryll's pick 9/29: the flower of light): whenever nobody is at the cabinet in a run (before
// the first coin, after walking away, a credit left waiting) the glass shows the flower breathing, never a game playing
// itself. A coin (or coming back to a credit) dissolves it into the notice or the game's ready card (~1.1 s, no cut); walking
// away dissolves the game back into it.
//
// THE RUN (docs/THE_PLAN/CABINET_SEVEN_GAMES.md, step 1a): Hearth -> the Constellation -> the Beacon -> the Labyrinth ->
// the Resonance -> the Ascent -> the Tunnel, in order: no skipping, no choosing.
//   coin -> (first coin only: the notice) -> the game's ready card -> play.
//   WIN a game: its own win plays on (the won frame, games.js `hold`), then THE REDRAW (js/cabinet/transition/redraw.js)
//     reshapes its lines into the next game's ready frame and lights the next of the seven dots; the next game plays.
//   LOSE a game: its lost card, then its attract; the run waits for another quarter and CONTINUES ON THAT GAME.
//   THE MERCY RULE across the whole run (RunLedger): the machine counts the quarters put into it and the rounds lost on it,
//     so every game's knobs ease by every round lost so far, and the FIFTH quarter can't be lost (each game honours
//     credit.unlosable its own way). A run costs at most five quarters.
//   WALK AWAY (abort): mid-round, the round ends like the SDK's abort (no loss recorded, the credit is spent); before a
//     round has begun (the notice, a ready card, a redraw) the credit is kept.
//   THE TUNNEL's passage (the fall, the light, THE PASSAGE, the seventh dot) -> finale.js (the hook for step 1b: THE GATE
//     and A·V·R on the tube) -> the run's win is reported; the tube freezes on its last picture for the ending.
// Only the game on the glass (or the redraw) is stepped and drawn in a frame. Games are made lazily (the one playing and
// the next), and the one before is disposed once the redraw has left it.
//
// THE PICTURE: each game draws its own look kit (1024 x 768, as its page) into a texture; that texture (mip-mapped here, so
// the fine lines stay clean when the glass is smaller than the picture) goes on the cabinet's CRT material. The paintings
// already carry the tube's curve and bezel, so the glass does not bend them again (prepare: curve 0). Line widths are
// resolved against a viewport of the picture's own size (vp), so a line is as thick, relative to the picture, as on the
// games' own pages at 1024 x 768, whatever the window's size.
import * as THREE from 'three';
import { RoundResult, CabinetState, CabinetInput } from '../sdk/index.js';
import { createRedraw } from '../transition/redraw.js';
import { withLookKitDefaults } from '../lookkit/index.js';
import { createAttract } from './attract.js';
import { warmPlanWorker } from '../transition/planasync.js';
import { ProgressRow } from '../transition/progress.js';
import { GAMES, GAME_IDS, NOTICE_CONTROLS, readNotice, pairOptions } from './games.js';
import { SevenKeys } from './input.js';
import { NoticeCard } from './notice.js';
import { createFinale } from './finale.js';
import { makeSevenGlass } from './glass.js';

export const SEVEN = 'seven';

// the glass's tube on top of the games' own (their kits already draw a tube: scanlines, vignette, the painted bezel), kept
// light: no second curvature (the paintings carry the tube's curve), the picture as bright as on its page
const GLASS_LOOK = { curve: 0, brightness: 1.0, scan: 0.12, grille: 0.08, chroma: 0.0008, noise: 0.03, vignette: 0.35 };
export { GAMES, GAME_IDS, NOTICE_CONTROLS };

const STEP = 1 / 60;
const IDLE = Object.freeze({ x: 0, y: 0, a: false, b: false, start: false });
const PASSAGE_HOLD = 6.0;          // s of the Tunnel's passage card before the finale (its light settles by 3.4 s)
const DISSOLVE = 1.1;              // s: the flower <-> a game (or the notice) on the glass, cross-faded
const HOLD_STILL = 0.35;           // s at least of the settled win picture held still before the redraw begins
const MAKE_AFTER = 0.3;            // s into a new game's ready card: the game after it is made (a long task, off the redraw)
const DOT7 = [0.8, 2.2];           // s into the passage: the seventh dot lights (eased)
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };

// the per-pair redraw options of js/cabinet/transition/pairs.js, when that file is there (games.js has the fallback)
let PAIRS = null, pairsTried = null;
function loadPairs() {
  if (!pairsTried) {
    pairsTried = import('../transition/pairs.js')
      .then((m) => { PAIRS = m.REDRAW_PAIRS || m.default || null; })
      .catch(() => { PAIRS = null; });
  }
  return pairsTried;
}

/** The machine's mercy ledger (the SDK's IMercyLedger, one for the whole run): credits = quarters put in, losses = rounds
 *  lost on it, whatever the game. A game's start() records no credit here (the quarter was counted when it went in). */
export class RunLedger {
  constructor() { this.coins = 0; this.lost = 0; this.lostBy = {}; }
  coin() { this.coins++; }
  credits() { return this.coins; }
  losses() { return this.lost; }
  recordCredit() { /* counted at the coin */ }
  recordLoss(id) { this.lost++; this.lostBy[id] = (this.lostBy[id] || 0) + 1; }
}

// Hearth's won frame, as transition_test.html (approved) holds it: the card's words stay off (the redraw stands in for the
// card) and both painted animals wake on the wall; the round itself is never changed
function hearthWonView(sim) {
  const g0 = { bull: sim.bull.glow, deer: sim.deer.glow };
  let k = 0;
  const p = Object.create(sim);
  Object.defineProperties(p, {
    phaseTime: { get: () => 0 },
    bull: { get: () => ({ ...sim.bull, st: 'rest', glow: g0.bull + (1 - g0.bull) * smooth(k / 0.6) }) },
    deer: { get: () => ({ ...sim.deer, st: 'rest', glow: g0.deer + (1 - g0.deer) * smooth(k / 0.6) }) },
  });
  p.hold = (x) => { k = x; };
  return p;
}

function mipmapped(tex) {
  tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter; tex.anisotropy = 4;
  return tex;
}

// the textures a kit's scenes sample (its paintings, sprite sheets)
function texturesOf(kit) {
  const out = new Set();
  for (const root of [kit.scene, kit.overlay]) {
    if (!root) continue;
    root.traverse((o) => {
      for (const m of Array.isArray(o.material) ? o.material : o.material ? [o.material] : []) {
        for (const u of Object.values(m.uniforms || {})) if (u && u.value && u.value.isTexture && u.value.image) out.add(u.value);
        if (m.map && m.map.isTexture && m.map.image) out.add(m.map);
      }
    });
  }
  return [...out].filter((t) => !t.isRenderTargetTexture);
}

// everything a game's kit drew with, so a retired game gives its GPU memory back
function disposeGame(g) {
  const seen = new Set();
  const drop = (o) => { if (o && !seen.has(o) && typeof o.dispose === 'function') { seen.add(o); o.dispose(); } };
  for (const root of [g.kit.scene, g.kit.overlay]) {
    if (!root) continue;
    root.traverse((o) => {
      drop(o.geometry);
      for (const m of Array.isArray(o.material) ? o.material : o.material ? [o.material] : []) {
        for (const u of Object.values(m.uniforms || {})) if (u && u.value && u.value.isTexture) drop(u.value);
        for (const k of ['map', 'alphaMap']) if (m[k] && m[k].isTexture) drop(m[k]);
        drop(m);
      }
    });
  }
  g.dispose();
}

export class SevenScreen {
  constructor(renderer, o = {}) {
    this.renderer = renderer;
    this.size = o.size || [1024, 768];
    this.ledger = new RunLedger();
    this.keys = new SevenKeys(o.target || globalThis.window);
    this.games = new Array(GAMES.length).fill(null);
    this.bots = new Array(GAMES.length).fill(null);
    this.making = new Array(GAMES.length).fill(null);
    this.clock = new Array(GAMES.length).fill(0);
    this.readState = {};
    this.idx = 0; this.stage = 'boot'; this.credit = false; this.engaged = false; this.noticeSeen = false;
    this.row = null; this.lit = new Array(GAMES.length).fill(0);
    this.rd = null; this.hold = null; this.passage = null; this.finale = null; this.bot = null;
    this.m = null; this.fade = null; this.timeScale = 1; this.auto = null;
    this.snd = null;                                 // its sound (sound.js), set by main.js after the player's first gesture
    this.onOver = null; this.onGame = null; this.onNeedCoin = null; this.onCoinWanted = null;
    this.idleInput = new CabinetInput();
    this.notice = null; this._retire = [];
    this.fullScale = o.renderScale || 1;             // the games' renderScale (setFullScale)
    this.attract = null;                             // the start screen (attract.js), made in warm()
    this.pointer = { px: NaN, py: NaN, use: false, down: false, tap: false };   // the mouse on the glass (pointerAt / pointerMove)
    this._makeNext = null;
    const ph = new THREE.DataTexture(new Uint8Array([3, 3, 5, 255]), 1, 1); ph.colorSpace = THREE.SRGBColorSpace; ph.needsUpdate = true;
    this.placeholder = ph; this.shown = ph;
    this._vpSave = new THREE.Vector4();
    this.stats = { made: {}, compile: {}, first: {}, begin: [], redraws: [], cpu: { n: 0, sum: 0, max: 0, last: 0 }, events: [] };
    loadPairs();
  }

  // ------------------------------------------------------------------ the tube interface (js/main.js, js/ending.js)
  get t() { return this.shown; }
  get live() { return !!this.games[this.idx]; }
  get frozen() { return this.stage === 'won'; }
  get playing() { return this.engaged; }
  get canStart() { return !!this.games[this.idx] && this.stage !== 'boot' && this.stage !== 'won' && this.stage !== 'finale'; }
  get needsCoin() { return this.stage === 'attract' && !this.credit; }
  get game() { return this.games[this.idx]; }
  get gameId() { return GAMES[this.idx].id; }
  /** what the bottom-of-screen hint should show: 'notice', the id of the game on the glass, or 'none' (the passage and after: nothing to press) */
  get hint() { return this.stage === 'notice' ? 'notice' : this.stage === 'passage' || this.stage === 'finale' || this.stage === 'won' ? 'none' : GAMES[this.idx].id; }

  /** The glass for the seven, on the delivered cabinet's screen (screen = { mesh, material } from js/outside.js): glass.js,
   *  made from its CRT material's values. Called before js/ending.js builds its tunnel from screen.material, so the swap to
   *  the tunnel at the pull matches. */
  prepare(screen, pipe) {
    const crt = screen.material, u0 = crt.uniforms;
    this.crt0 = Object.fromEntries(Object.entries(u0).filter(([, v]) => typeof v.value === 'number').map(([k, v]) => [k, v.value]));
    const glass = makeSevenGlass(crt, pipe, GLASS_LOOK);
    screen.mesh.material = glass; screen.material = glass;
    const u = glass.uniforms; u.map.value = this.shown; u.nextMap.value = this.shown; u.blend.value = 0;
    return glass;
  }
  attach(material) { this.m = material; this._show(this.attract && this._flowerWanted() ? this.attract.texture : this.shown); }

  /** Make the start screen, then the first games (Hearth, and the Constellation behind it) now, while the van pulls up. */
  warm() {
    if (this._warming) return this._warming;
    this._warming = (async () => {
      await loadPairs();
      warmPlanWorker();
      await this._makeAttract();
      if (this.attract && this._flowerWanted()) this._show(this.attract.texture);
      await this.ensure(0);
      if (this.stage === 'boot' && this.games[0]) { this.stage = 'attract'; if (!this._flowerWanted()) this._show(this.games[0].kit.texture); }
      this.ensure(1);
    })().catch((e) => console.error('[seven] warm', e));
    return this._warming;
  }
  /** THE START SCREEN (attract.js): made once, its shaders compiled and its paintings on the GPU before it is first seen. */
  async _makeAttract() {
    if (this.attract || this._attractMaking) return this._attractMaking;
    this._attractMaking = (async () => {
      const t0 = performance.now();
      const A = await createAttract(this.renderer, { width: this.size[0], height: this.size[1], renderScale: 1 });
      mipmapped(A.kit.output.texture);
      const r = this.renderer, prev = r.getRenderTarget();
      let p;
      r.setRenderTarget(A.kit.output);
      try { p = r.compileAsync(A.kit.scene, A.kit.camera); } finally { r.setRenderTarget(prev); }
      await p;
      for (const t of texturesOf(A.kit)) { await new Promise((res) => setTimeout(res, 0)); r.initTexture(t); }
      await new Promise((res) => setTimeout(res, 0));
      this._vp(() => A.update(1 / 60, { words: this._words() }));
      this.attract = A;
      this.stats.made.attract = Math.round(performance.now() - t0);
      return A;
    })().catch((e) => { console.error('[seven] the start screen could not be made', e); this._attractMaking = null; return null; });
    return this._attractMaking;
  }
  /** The flower is on the glass whenever nobody is at the cabinet in a run: before a coin, after walking away, a credit
   *  waiting. (At the cabinet after a lost game, the game's own card and attract stay, asking for the quarter.) */
  _flowerWanted() {
    if (!this.attract || this.engaged) return false;
    return this.stage === 'attract' || this.stage === 'parked' || this.stage === 'boot' || this.stage === 'notice';
  }
  _words() { return this.credit ? '' : 'INSERT COIN'; }
  get showingFlower() { return !!this.attract && this.shown === this.attract.texture; }

  /** The games' renderScale: s x 1024x768, the glass's real pixels at full screen (main.js). Games made from now on use it; the
   *  ones already made follow at a quiet moment (not mid-redraw: that has its own two scales). */
  setFullScale(s) {
    s = Math.max(1, Math.min(2, +s || 1));
    if (Math.abs(s - this.fullScale) < 1e-6) return this.fullScale;
    this.fullScale = s; this._scaleDirty = true;
    return s;
  }
  _applyScale() {
    if (!this._scaleDirty || this.stage === 'hold' || this.stage === 'redraw' || this.stage === 'passage' || this.stage === 'finale' || this.stage === 'won') return;
    this._scaleDirty = false;
    const s = this.fullScale;
    for (const g of this.games) {
      if (!g) continue;
      if (typeof g.setRenderScale === 'function') g.setRenderScale(s);
      else if (Math.abs(g.kit.renderScale - s) > 1e-6) { g.kit.setSize(g.kit.width, g.kit.height, s); g.kit.resetPersistence(); }
      mipmapped(g.kit.output.texture);
    }
    if (this.notice && this.shown !== this.notice.texture) { this.notice.dispose(); this.notice = null; }
    this._event('scale', { scale: s });
  }

  // ------------------------------------------------------------------ the mouse (a game with pointer: the Constellation)
  /** true while the game on the glass takes the mouse (main.js: the mouse aims instead of looking round) */
  get wantsPointer() { return this.engaged && !!GAMES[this.idx].pointer && (this.stage === 'play' || this.stage === 'parked'); }
  /** the mouse's place on the glass, in frame coords (an absolute mouse: the cursor is the sight) */
  pointerAt(px, py) { const P = this.pointer; P.px = px; P.py = py; P.use = true; P.rel = false; }
  /** the mouse moved dx, dy frame px (a locked pointer, like a trackball): from where the sight is now */
  pointerMove(dx, dy) {
    const P = this.pointer, G = GAMES[this.idx];
    if (!P.use || !P.rel || !Number.isFinite(P.px)) { const a = G.aimOf && this.game && G.aimOf(this.game.sim); if (!a) return; P.px = a[0]; P.py = a[1]; }
    P.px += dx; P.py += dy; P.use = true; P.rel = true;
    const b = G.aimBox && G.aimBox();                   // (kept inside the sky the sight can reach: no dead travel past its edge)
    if (b) { P.px = Math.min(b[2], Math.max(b[0], P.px)); P.py = Math.min(b[3], Math.max(b[1], P.py)); }
  }
  pointerButton(down) { const P = this.pointer; if (down) { P.down = true; P.tap = true; } else P.down = false; }
  _pointerReset() { const P = this.pointer; P.px = NaN; P.py = NaN; P.use = false; P.down = false; P.tap = false; P.rel = false; }
  // (the old tube's name for it, kept so main.js's call reads the same)
  warmWin() { return this.warm(); }

  coin() {
    if (this.stage === 'won' || this.stage === 'finale') return false;
    this.ledger.coin(); this.credit = true;
    if (this.snd) this.snd.coin();
    this._event('coin', { coins: this.ledger.coins });
    return true;
  }

  start() {
    if (!this.canStart) return false;
    this.engaged = true; this.keys.enabled = true; this._pointerReset();
    if (this.stage === 'attract' && this.credit) this._begin();
    else if (this.stage === 'parked') {
      this.stage = 'play'; this._event('resume');
      if (this.shown !== this.game.kit.texture) this._show(this.game.kit.texture, DISSOLVE);      // out of the flower
    } else if (this.stage === 'attract' && this.showingFlower) this._show(this.game.kit.texture, DISSOLVE);
    return true;
  }

  abort() {
    if (!this.engaged) return false;
    if (this.snd) this.snd.leave();
    this.engaged = false; this.keys.enabled = false; this._pointerReset();
    const g = this.game;
    switch (this.stage) {
      case 'notice':                      // the credit is kept (the flower comes back: update() dissolves to it)
        this.stage = 'attract'; if (!this.attract) this._show(g.kit.texture, 0.5); break;
      case 'play': {
        const s = g.sim;
        if (g.mode !== 'play') break;
        if (s.phase === 'card') break;                                    // it ends by itself (lost: its card, then attract)
        if (s.phase === 'ready' && !(s.levelTime > 0)) { this.stage = 'parked'; this._event('park'); break; }   // not begun
        // mid-round: the SDK's abort (no loss recorded; the credit was spent on this round)
        s._state = CabinetState.Over; s._result = RoundResult.None;
        this._run(g, 0, IDLE);
        this._event('abort', { game: this.gameId });
        break;
      }
      default: break;                     // the hold, the redraw, the passage run on by themselves
    }
    return true;
  }

  // ------------------------------------------------------------------ the games, made lazily
  /** Make game i (its look kit, its view, its bot class) if it isn't made yet; resolves to the game. */
  ensure(i) {
    if (i < 0 || i >= GAMES.length) return Promise.resolve(null);
    if (this.games[i]) return Promise.resolve(this.games[i]);
    if (this.making[i]) return this.making[i];
    const G = GAMES[i];
    this.making[i] = (async () => {
      const t0 = performance.now();
      const [create, Bot] = await Promise.all([G.load(), G.bot()]);
      const opts = { width: this.size[0], height: this.size[1], ledger: this.ledger, cabinetId: SEVEN + ':' + G.id, inCabinet: true };
      // drawn at the glass's real pixels at full screen: the games that pass no renderScale get the host's (the look kit's
      // default, set only while the game makes its kit); the Tunnel takes it as its own option
      const scale = this.fullScale;
      opts.renderScale = scale;
      const g = await withLookKitDefaults({ renderScale: scale }, () => create(this.renderer, opts));
      if (Math.abs(g.kit.renderScale - this.fullScale) > 1e-6) this._scaleDirty = true;      // (the window changed meanwhile)
      mipmapped(g.kit.output.texture);
      g.onRoundOver = (result, summary, info) => this._roundOver(i, result, info);
      this.bots[i] = Bot;
      this.stats.made[G.id] = Math.round(performance.now() - t0);
      // its shaders, compiled without blocking the frame (for a render target: the programs' colour-space key)
      const t1 = performance.now();
      const r = this.renderer, prev = r.getRenderTarget();
      let p;
      r.setRenderTarget(g.kit.output);
      try { p = Promise.all([r.compileAsync(g.kit.scene, g.kit.camera), g.kit.overlay ? r.compileAsync(g.kit.overlay, g.kit.camera) : null]); }
      finally { r.setRenderTarget(prev); }
      await p;
      this.stats.compile[G.id] = Math.round(performance.now() - t1);
      // its paintings: decoded off the main thread, then sent to the GPU one per task (a big plate decoded AT the first draw
      // cost that frame up to ~180 ms, and the next game is made while this one is being played)
      const t3 = performance.now();
      const texs = texturesOf(g.kit);
      await Promise.all(texs.map((t) => (t.image && typeof t.image.decode === 'function' ? t.image.decode().catch(() => {}) : null)));
      let worst = 0;
      for (const t of texs) {
        await new Promise((res) => setTimeout(res, 0));
        const u0 = performance.now(); this.renderer.initTexture(t); worst = Math.max(worst, performance.now() - u0);
      }
      this.stats.upload = this.stats.upload || {};
      this.stats.upload[G.id] = { n: texs.length, ms: Math.round(performance.now() - t3), worstTask: +worst.toFixed(1) };
      // the first draw (the post passes, the lines' buffers): one attract frame
      await new Promise((res) => setTimeout(res, 0));
      const t2 = performance.now();
      this.clock[i] = 0;
      this._run(g, STEP, IDLE, undefined, i);
      this.stats.first[G.id] = Math.round(performance.now() - t2);
      this.games[i] = g; this.making[i] = null;
      return g;
    })().catch((e) => {                                // (logged; the next call tries again)
      console.error('[seven] could not make ' + G.id, e);
      this.making[i] = null;
      return null;
    });
    return this.making[i];
  }

  // ------------------------------------------------------------------ each frame
  update(dt) {
    if (!this.m) return;
    const t0 = performance.now();
    dt = Math.max(0, dt) * this.timeScale;
    this._applyScale();
    // THE START SCREEN: the flower comes back (dissolving) whenever nobody is at the cabinet in a run; it is drawn while it is on
    // the glass or fading off it, and only then
    const flower = this._flowerWanted();
    if (flower && this.shown !== this.attract.texture) this._show(this.attract.texture, this.stage === 'boot' ? 0 : DISSOLVE);
    if (this.attract && (this.shown === this.attract.texture || (this.fade && this.fade.from === this.attract.texture))) {
      this._vp(() => this.attract.update(dt, { words: this._words() }));
    }
    this._fadeStep(dt);
    if (this.snd) this.snd.flower(!!this.attract && this.showingFlower && this.stage !== 'won', this.attract);
    const g = this.game, i = this.idx;
    switch (this.stage) {
      case 'boot':
        if (g) { this.stage = 'attract'; if (!flower) this._show(g.kit.texture); }
        else if (!this.making[i] && (this._bootRetry = (this._bootRetry || 0) + dt) > 3) { this._bootRetry = 0; this.ensure(i); }
        break;
      case 'attract':
        if (!flower) this._run(g, dt, IDLE);          // (at the cabinet after a lost game: its own card and attract, INSERT COIN)
        if (this.auto && this.engaged && this.needsCoin && this.onCoinWanted) {      // (the bots' run: main.js pays the quarter)
          this.auto.wait = (this.auto.wait || 0) + dt;
          if (this.auto.wait > 0.6) { this.auto.wait = 0; this.onCoinWanted(); }
        }
        break;
      case 'notice': {
        const go = this.auto ? (this._noticeT = (this._noticeT || 0) + dt) > 0.6 : this.keys.frame(readNotice);
        if (go) { this.noticeSeen = true; this._noticeT = 0; this._startRound(0.6); }
        break;
      }
      case 'play': {
        const s0 = g.sim;
        const opts = this.bot && g.mode === 'play' ? { bot: this.bot } : undefined;
        let frame = this.engaged && !opts ? this.keys.frame(GAMES[i].read, this.readState) : IDLE;
        if (frame !== IDLE && GAMES[i].pointer) frame = this._withPointer(frame);
        this._run(g, dt, frame, opts);
        const s = g.sim;
        // the game after this one is made a moment into this one's ready card (a long task: never during a redraw)
        const M = this._makeNext;
        if (M && M.i === i && (M.t += dt) >= MAKE_AFTER && (s.phase === 'ready' || M.t > 6)) { this._makeNext = null; this.ensure(i + 1); }
        if (this.stage === 'play' && g.mode === 'play' && s === s0 && s.phase === 'card' && s.result === RoundResult.Won) {
          if (i === GAMES.length - 1) this._beginPassage(); else this._beginHold();
        }
        break;
      }
      case 'parked': break;                              // the next game's ready frame waits for you (credit kept; the flower shows)
      case 'hold': this._holdStep(dt); break;
      case 'redraw': {
        this._vp(() => this.rd.update(dt));
        if (this.snd && this.rdSound) this.snd.redraw({ ...this.rdSound, phase: 'trans', u: this.rd.u });
        if (this.rd.done) this._handoff();
        break;
      }
      case 'passage': this._passageStep(dt); break;
      case 'finale': {
        const F = this.finale;
        let done = true;
        try { done = !F || F.update(dt); } catch (e) { console.error('[seven] finale', e); }
        if (F && F.texture && F.texture !== this.shown) this._show(F.texture, 0.4);
        if (done) this._won();
        break;
      }
      case 'won': default: break;
    }
    const ms = performance.now() - t0, C = this.stats.cpu;
    C.n++; C.sum += ms; C.max = Math.max(C.max, ms); C.last = ms;
  }

  // ------------------------------------------------------------------ the run
  _begin() {
    if (!this.noticeSeen && this.idx === 0) {
      // (drawn at the glass's real pixels: it is read at full screen)
      if (!this.notice) this.notice = new NoticeCard(Math.round(this.size[0] * this.fullScale), Math.round(this.size[1] * this.fullScale));
      if (!this.notice.drawn) this.notice.draw();
      this.stage = 'notice'; this._noticeT = 0; this.keys.consume();
      this._show(this.notice.texture, this.showingFlower ? DISSOLVE : 0.5);
      this._event('notice');
      return;
    }
    this._startRound(0);
  }
  /** A credit starts (or continues) the game on the glass: a fresh round at its ready card. */
  _startRound(fade) {
    const g = this.game, i = this.idx;
    this.readState = {}; this.keys.consume();
    g.start(this._seed(i));
    this.bot = this._botFor(i);
    this.stage = this.engaged || this.auto ? 'play' : 'parked';
    if (this.shown !== g.kit.texture) this._show(g.kit.texture, this.showingFlower ? DISSOLVE : fade || 0);
    this._event('round', { game: GAMES[i].id, credit: g.sim.credit.number, losses: g.sim.credit.lossesBefore, unlosable: g.sim.credit.unlosable });
    this.ensure(i + 1);
    this.onGame && this.onGame(GAMES[i].id);
  }
  _roundOver(i, result, info) {
    if (i !== this.idx || this.stage !== 'play') return;
    if (result === RoundResult.Won) return;              // (the host moves on from the won card before its end)
    this.credit = false; this.stage = 'attract'; this.bot = null;
    this._event(result === RoundResult.Lost ? 'lost' : 'aborted', { game: GAMES[i].id, losses: this.ledger.lost, credit: info && info.credit });
    this.onNeedCoin && this.onNeedCoin(GAMES[i].id);
  }

  // THE WON HOLD: the game's own win plays until its win picture has SETTLED (games.js hold.settle: the Resonance's hexafoil
  // still, Atlantis risen, the Labyrinth's figure drawn), or Hearth's approved hold; the card's words, where they would come
  // before that, are hidden (the redraw stands in for the card). Then the picture is held STILL and the redraw begins from it.
  _beginHold() {
    const i = this.idx, G = GAMES[i], H0 = G.hold || {};
    this.hold = { secs: H0.secs || 1, settle: H0.settle, words: H0.words, proxy: H0.proxy === 'hearth' ? hearthWonView(this.game.sim) : null,
      ticks: 0, acc: 0, t: 0, frozen: false, rd: null };
    this.stage = 'hold';
    this._event('won', { game: G.id, score: this.game.sim.score });
    this.ensure(i + 1);
  }
  /** the card's words (and the dark band behind them) off: a view's sText / band carry nothing else on a won card */
  _hideWords(g) {
    for (const k of ['sText', 'band']) { const b = g.view && g.view[k]; if (b && b.object) b.object.visible = false; }
    this.hold.wordsHidden = true;
  }
  // The hold's last stretch is a STILL frame: the sim and the view stop, the pairing for the redraw is built from exactly that
  // frame in a Web Worker (transition/planasync.js), and the redraw begins the moment it's in (begin() then costs a few ms).
  // Nothing on the main thread waits, so the arcade never hitches at a redraw's start; if the worker is slower, the settled
  // picture just holds a little longer (at least HOLD_STILL: the eye gets to see it finished).
  _freezeHold(i) {
    const H = this.hold, A = this.games[i], B = this.games[i + 1];
    H.frozen = true; H.frozenAt = H.t;
    // B: a fresh round at its ready card, its view warmed, nothing played (transition_test.html's constellationReady)
    B.start(this._seed(i + 1));
    const ui = { mode: 'play', hi: B.state.hi, last: B.state.last };
    for (let k = 0; k < 40; k++) B.view.update(B.sim, STEP, this.clock[i + 1] + STEP, ui);
    const opts = pairOptions(i, PAIRS);
    H.opts = opts;
    H.rd = createRedraw(this.renderer, A, B, opts);
    mipmapped(H.rd.kit.output.texture);
    const t0 = performance.now();
    this._vp(() => H.rd.prepare());
    H.prepMs = +(performance.now() - t0).toFixed(1);
  }
  _holdStep(dt) {
    const H = this.hold, g = this.game, i = this.idx;
    H.t += dt;
    if (!this.games[i + 1] && !this.making[i + 1] && (H.retry = (H.retry || 0) + dt) > 2) { H.retry = 0; this.ensure(i + 1); }
    const B = this.games[i + 1];
    if (!H.frozen) {
      const settled = H.proxy ? H.ticks >= Math.round(H.secs * 60) : g.sim.phaseTime >= H.settle - 1e-4 || H.stuck;
      if (B && settled) { this._freezeHold(i); return; }
      if (H.proxy) {
        const total = Math.round(H.secs * 60);
        H.acc += dt;
        const want = Math.min(total, Math.floor(H.acc * 60 + 1e-6));
        const ui = { mode: 'play', hi: g.state.hi, last: g.state.last };
        while (H.ticks < want) {
          H.ticks++;
          g.sim.step(STEP, this.idleInput);
          H.proxy.hold(H.ticks / total);
          this.clock[i] += STEP;
          g.view.update(H.proxy, STEP, this.clock[i], ui);
        }
        if (H.ticks < total || !H.drawnLast) { this._vp(() => g.kit.render(Math.min(Math.max(dt, 1e-4), 0.1))); H.drawnLast = H.ticks >= total; }
      } else if (g.sim.phaseTime < H.settle) {
        // the game's own card phase (the real clock), landing exactly on its settled picture
        if (H.words !== undefined && H.words < H.settle && !H.wordsHidden && g.sim.phaseTime + dt >= H.words - 0.05) this._hideWords(g);
        // (the sims tick at a fixed 1/60 from an accumulator: a short step may not tick, and the landing can pass the settle by
        // up to one tick; a clock that never moves at all, for a second of frames, takes the picture as it is)
        const pt = g.sim.phaseTime;
        this._run(g, Math.min(dt, H.settle - pt + 1e-5), IDLE);
        H.still = g.sim.phaseTime > pt ? 0 : (H.still || 0) + 1;
        if (H.still > 60) H.stuck = true;
      }
      return;
    }
    // frozen: the picture holds still (the kit keeps drawing it, so the phosphor trails settle as they would on a held frame);
    // go once the plan is in and the settled picture has been seen still for a moment
    if (!H.rd.warmed) this._vp(() => g.kit.render(Math.min(Math.max(dt, 1e-4), 0.1)));
    if (H.rd.planReady) {
      if (!H.warming) { this._planMs = this._planMs || {}; this._planMs[i] = H.workerMs = H.rd.preparedMs; H.warming = true; this._vp(() => H.rd.warm()); }
      else if (H.rd.warmed && H.t - H.frozenAt >= HOLD_STILL) this._beginRedraw();
    }
  }
  _beginRedraw() {
    const i = this.idx, A = this.games[i], B = this.games[i + 1], H = this.hold, rd = H.rd, opts = H.opts;
    const t0 = performance.now();
    this._vp(() => rd.begin());
    const ms = +(performance.now() - t0).toFixed(1);
    this.stats.begin.push({ pair: GAMES[i].id + '>' + GAMES[i + 1].id, ms, plan: rd.plan && rd.plan.beginMs, pieces: rd.plan && rd.plan.count,
      marks: rd.marks, prepared: !!(rd.plan && rd.plan.prepared), stale: !!rd.stale, prepareMs: H.prepMs, workerMs: H.workerMs, still: +(H.t - H.frozenAt).toFixed(2) });
    this.rd = rd; this.hold = null; this.stage = 'redraw';
    this.rdSound = { index: opts.index ?? i, from: GAMES[i].id, to: GAMES[i + 1].id, land: (opts.light && opts.light.to) ?? 0.6 };
    this._show(rd.kit.texture);
    this._event('redraw', { from: GAMES[i].id, to: GAMES[i + 1].id, index: opts.index, ms, settledAt: H.settle !== undefined ? +this.games[i].sim.phaseTime.toFixed(3) : null, still: +(H.t - H.frozenAt).toFixed(2) });
    // (the game after the next one is made a moment into the next one's ready card, not now: its making is one long task,
    // and a redraw is all motion)
    this._makeNext = { i: i + 1, t: 0 };
  }
  _handoff() {
    const i = this.idx, A = this.games[i], B = this.games[i + 1], rd = this.rd;
    const row = rd.handoff();
    if (this.snd && this.rdSound) { this.snd.redraw({ ...this.rdSound, phase: 'ready', u: 1 }); this.snd.retire(A); }
    this.rdSound = null;
    rd.end(); rd.dispose(); this.rd = null;
    B.kit.resetPersistence();
    for (let k = 0; k <= i; k++) this.lit[k] = 1;
    this.row = row;                                     // (the old row, in A's kit, goes with A)
    disposeGame(A); this.games[i] = null;
    this.idx = i + 1;
    this._show(B.kit.texture);
    this.readState = {}; this.keys.consume(); this._pointerReset();
    this.bot = this._botFor(this.idx);
    this.stage = this.engaged || this.auto ? 'play' : 'parked';
    this._event('handoff', { game: GAMES[this.idx].id, lit: this.lit.filter(Boolean).length });
    this.onGame && this.onGame(GAMES[this.idx].id);
  }

  // THE TUNNEL: its passage plays on the glass, the seventh dot lights, then the finale (1b) and the win
  _beginPassage() {
    this.stage = 'passage'; this.passage = { t: 0 };
    this._event('passage', { score: this.game.sim.score });
  }
  _passageStep(dt) {
    const g = this.game, s = g.sim;
    this.lit[GAMES.length - 1] = smooth((s.phaseTime - DOT7[0]) / (DOT7[1] - DOT7[0]));
    if (this.row) this.row.draw(this.lit, 1);
    if (s.phaseTime < PASSAGE_HOLD) this._run(g, dt, IDLE);
    if (s.phaseTime >= PASSAGE_HOLD) {
      this.lit[GAMES.length - 1] = 1; if (this.row) this.row.draw(this.lit, 1);
      this._vp(() => g.kit.render(1 / 60));
      this.finale = createFinale({ renderer: this.renderer, game: g, row: this.row, frame: g.kit.frame,
        show: (tex, fade) => this._show(tex, fade), vp: (fn) => this._vp(fn), snd: this.snd });
      this.stage = 'finale';
      if (!this.finale) this._won();
    }
  }
  _won() {
    if (this.stage === 'won') return;
    if (this.snd) this.snd.silence();
    this.stage = 'won'; this.engaged = false; this.keys.enabled = false; this.auto = null; this.bot = null;
    this._event('runWon', { coins: this.ledger.coins, losses: this.ledger.lost });
    this.onOver && this.onOver(true, { coins: this.ledger.coins, losses: this.ledger.lost });
  }

  _seed(i) { const S = this.auto && this.auto.seeds; return S && S[i] !== undefined ? S[i] : undefined; }
  _botFor(i) {
    if (!this.auto || !this.bots[i]) return null;
    const id = GAMES[i].id, lose = this.auto.lose || {};
    let kind = this.auto.kind || 'good';
    if (lose[id] > 0) { lose[id]--; kind = 'idle'; }
    const b = new this.bots[i](kind); b.reset((this._seed(i) ?? 7) + this.ledger.coins);
    b.kind = kind;
    return b;
  }

  // ------------------------------------------------------------------ drawing
  /** One game step + draw (the game's own update: its sim, its view, its kit), with the cabinet's line viewport. */
  _run(g, dt, frame, opts, i = this.idx) {
    this.clock[i] += Math.min(Math.max(dt, 0), 0.1);
    if (g.view) g.view.cabinetStart = this.credit ? 'PRESS E' : 'INSERT COIN';     // (the attract card's words: a coin starts it)
    this._vp(() => g.update(dt, frame, opts));
    if (this.snd && i === this.idx && (this.engaged || this.auto)) this.snd.game(g, GAMES[i].id, dt);
  }
  /** Line widths (three's LineSegments2) resolve against the renderer's viewport: give them the picture's own size. */
  _vp(fn) {
    const r = this.renderer;
    r.getViewport(this._vpSave);
    const keep = this._vpSave.clone();
    r.setViewport(0, 0, this.size[0], this.size[1]);
    try { return fn(); } finally { r.setViewport(keep); }
  }
  /** The pointer merged into a game's input frame (the Constellation's page does the same: the aim follows whichever moved
   *  last, the mouse or the arrows; a click fires from the nearest base). */
  _withPointer(frame) {
    const P = this.pointer;
    if (frame.x || frame.y) P.use = false;             // the arrows took the sight over, until the mouse moves again
    const f = { ...frame };
    if (P.use && Number.isFinite(P.px)) { f.px = P.px; f.py = P.py; }
    if (P.down || P.tap) f.a = true;
    P.tap = false;
    return f;
  }
  /** Put a picture on the glass; fade > 0 cross-fades through the CRT material's blend (no cut, no black). */
  _show(tex, fade = 0) {
    const from = this.shown;
    this.shown = tex;
    if (!this.m) return;
    const u = this.m.uniforms;
    if (fade > 0 && from && from !== tex) {
      // (a fade already running: the new one starts from the picture it was fading to)
      const f0 = this.fade ? this.fade.to : from;
      this.fade = { from: f0, to: tex, t: 0, d: fade }; u.map.value = f0; u.nextMap.value = tex; u.blend.value = 0;
      if (f0 === tex) { this.fade = null; u.map.value = tex; u.blend.value = 0; }
    }
    else { this.fade = null; u.map.value = tex; u.nextMap.value = tex; u.blend.value = 0; }
  }
  _fadeStep(dt) {
    const F = this.fade; if (!F || !this.m) return;
    F.t += dt;
    const u = this.m.uniforms;
    u.blend.value = smooth(F.t / F.d);
    if (F.t >= F.d) { u.map.value = F.to; u.nextMap.value = F.to; u.blend.value = 0; this.fade = null; this._retireNow(); }
  }
  _retireNow() { for (const g of this._retire.splice(0)) disposeGame(g); }
  _event(kind, o = {}) {
    const e = { kind, at: +(performance.now() / 1000).toFixed(2), game: GAMES[this.idx].id, ...o };
    this.stats.events.push(e);
    if (this.stats.events.length > 400) this.stats.events.shift();
  }

  // ------------------------------------------------------------------ dev hooks (window.__node.cabinet in main.js)
  /** Level n (1-7) on the glass now, with a credit; the dots before it lit. A soft cross-fade (never a cut). */
  async jump(n) {
    const i = Math.max(0, Math.min(GAMES.length - 1, (n | 0) - 1));
    const g = await this.ensure(i);
    if (!g) return this.info();
    if (this.rd) { this.rd.end(); this.rd.dispose(); this.rd = null; }
    if (this.hold && this.hold.rd) { this.hold.rd.dispose(); }
    if (this.row) { const old = this.games[this.idx]; if (old) this.row.detach(old.kit); this.row = null; }   // (the row lives in that game's kit)
    for (let k = 0; k < GAMES.length; k++) {
      // (retired once the glass has faded off them: the fade reads the old picture)
      if (k !== i && this.games[k]) { this._retire.push(this.games[k]); this.games[k] = null; }
    }
    this.lit.fill(0);
    for (let k = 0; k < i; k++) this.lit[k] = 1;
    if (i > 0) { this.row = new ProgressRow().attach(g.kit); this.row.draw(this.lit, 1); }
    this.idx = i; this.hold = null; this.passage = null; this.noticeSeen = true; this.credit = true;
    this.stage = 'attract';
    this._show(g.kit.texture, 0.35);
    if (!this.fade) this._retireNow();
    if (this.engaged || this.auto) this._startRound(0);
    this.ensure(i + 1);
    this.onGame && this.onGame(GAMES[i].id);
    return this.info();
  }
  /** Win the round on the glass (its own won card follows; the Tunnel goes to THE LET-GO instead, the real way out). */
  win() {
    const g = this.game; if (!g || this.stage !== 'play' || g.mode !== 'play') return false;
    const s = g.sim;
    if (s.phase === 'card') return false;
    if (GAMES[this.idx].id === 'tunnel') {
      if (s.phase === 'letgo' || s.phase === 'fall') return true;
      s.echoes.length = 0; s.shots.length = 0; s.heartLight = s.heartNeed; s.wavesCleared = 6; s.wave = 5;
      if (s._state !== CabinetState.Playing) { s._state = CabinetState.Playing; s.ship.alive = true; }
      s._startLetGo();
      return true;
    }
    if (s._state !== CabinetState.Playing) s._state = CabinetState.Playing;
    s._end(RoundResult.Won, 'dev');
    return true;
  }
  /** Lose the round on the glass (not on the unlosable fifth credit: the mercy rule holds). */
  lose() {
    const g = this.game; if (!g || this.stage !== 'play' || g.mode !== 'play') return false;
    const s = g.sim;
    if (s.phase === 'card' || s.credit.unlosable) return false;
    s._state = CabinetState.Playing; s._end(RoundResult.Lost, 'dev');
    return true;
  }
  /** The bots play: { kind: 'good', lose: { constellation: 1 } (that many first tries with the idle bot), seeds: [...] }. */
  autoplay(o = { kind: 'good' }) {
    this.auto = o ? { kind: o.kind || 'good', lose: { ...(o.lose || {}) }, seeds: o.seeds || null } : null;
    if (this.stage === 'play' && this.game && this.game.mode === 'play') this.bot = this._botFor(this.idx);
    return !!this.auto;
  }
  info() {
    const g = this.game, s = g && g.sim;
    return {
      stage: this.stage, game: GAMES[this.idx].id, level: this.idx + 1, credit: this.credit, needsCoin: this.needsCoin,
      engaged: this.engaged, coins: this.ledger.coins, losses: this.ledger.lost, lostBy: { ...this.ledger.lostBy },
      lit: this.lit.map((v) => +v.toFixed(2)), dots: this.lit.filter((v) => v >= 0.99).length,
      mode: g ? g.mode : null, phase: s ? s.phase : null, phaseTime: s ? +s.phaseTime.toFixed(2) : null, score: s ? s.score : null,
      unlosable: s && s.credit ? !!s.credit.unlosable : null, creditNo: s && s.credit ? s.credit.number : null,
      redraw: this.rd ? +this.rd.u.toFixed(3) : null, bot: this.bot ? this.bot.kind : null, auto: !!this.auto,
      made: this.games.map((x, k) => (x ? GAME_IDS[k] : null)).filter(Boolean), tex: this.shown === this.placeholder ? 'placeholder' : this.rd && this.shown === this.rd.kit.texture ? 'redraw' : this.notice && this.shown === this.notice.texture ? 'notice' : this.attract && this.shown === this.attract.texture ? 'attract' : 'game',
      pairs: !!PAIRS, fading: this.fade ? +(this.fade.t / this.fade.d).toFixed(2) : null, scale: this.fullScale,
      gameScale: g ? g.kit.renderScale : null, attract: this.attract ? this.attract.info() : null, wantsPointer: this.wantsPointer,
      pointer: Number.isFinite(this.pointer.px) ? [+this.pointer.px.toFixed(1), +this.pointer.py.toFixed(1)] : null,
      aim: g && GAMES[this.idx].aimOf ? GAMES[this.idx].aimOf(s) : null,
      hold: this.hold ? { frozen: !!this.hold.frozen, t: +this.hold.t.toFixed(2), settle: this.hold.settle ?? null, wordsHidden: !!this.hold.wordsHidden } : null,
    };
  }
}
