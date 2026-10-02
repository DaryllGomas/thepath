// THE ARCADE ANSWERS (docs/THE_PLAN/CANON.md item 6): THE ROOM'S SIDE. Game-agnostic: whatever runs on THE JUNCTION's
// Starvector cabinet (today's vector game, the laserdisc game later) calls four things, and the room does the rest. No words.
//
//   room.knock(1)              the neon sign outside flickers once (its red on the street and, through the front windows, on
//                              the cabinets dips; a faint crackle out there)
//   room.knock(2)              the jukebox stutters: a slice of the song three times, a catch of silence, then it plays on
//                              (the Junction's own jukebox, js/jukebox.js: main.js hands its song to this.music)
//   room.knock(3)              the lamp in the empty office upstairs clicks on (the office starts dark: nobody home)
//   room.answer(initials, o)   THE ARCADE ANSWERS: if you are at the machine's glass you step back first (the room in front of
//                              you); then every cabinet in the room drops what it shows at the same instant and shows its own
//                              high-score table, in its own colours and name, with those initials at #1 (each machine's #1 a score
//                              just over its old best, ending in 333; a blank #1 takes o.score); one soft unison chip tone from
//                              the machines together; the jukebox cuts out mid-note; the room's lights dip for a breath; the wall
//                              clock reads 3:33, as it always does (js/arcade.js). The tables hold, go back to their attracts,
//                              and hooks.done() brings the van (js/delivery.js, main.js).
// Each knock comes once a session. Each is safe to call from anywhere, at any time; answer() once.
//
// main.js hands it the cabinets, the outdoors (js/outside.js: signLight / officeLamp / roomLight), the audio and four hooks:
// atGlass() (is the player standing at the Starvector cabinet's glass), stepBack(secs, pose), release(pose), done().
// Today's Starvector is wired to it by js/starvector_answer.js (its waves, its freeze and name entry), a separate file.
import * as THREE from 'three';
import { PixelSurface, PixelFont, AttractMode, d6, idiv } from './cabinet/sdk/index.js';
import { Chip } from './cabinet/sound/chip.js';

export const ANSWER = {
  sign: { down: 0.04, off: 0.22, up: 0.12, low: 0.06 },          // knock 1: one dip (nothing flashes faster than 3 a second)
  stutter: { slice: 0.17, reps: 3, gap: 0.28 },                   // knock 2: a slice of the song three times, a catch
  lamp: { up: 0.07, settle: 0.25 },                               // knock 3: on, a breath of warm-up
  step: { secs: 1.5, pos: [77.0, -35.37, -168.55], target: [81.2, -34.55, -175.6] },   // the step back from the glass
  settle: 0.4,                         // s after the step before the room answers
  hold: 5,                             // s the tables stay up
  dip: { down: 0.25, low: 0.3, hold: 0.7, up: 0.7 },              // the room's lights: to 30 %, a breath, back (about 1.6 s)
  tone: { hz: 333, volume: 0.5, gain: 0.32 },                     // one soft unison tone (333: the cabinet's ward bell)
  resumeAfter: 1.5,                    // s after the tables go before the jukebox catches again
  prepPerFrame: 2,                     // answer tables drawn and uploaded per frame (26 in ~13 frames, during the step back)
};
const smooth = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };

// where the sounds come from (web coordinates)
const TONE_AT = [[75.9, -35.5, -171.4], [79.4, -35.5, -171.4], [77.7, -35.5, -174.1], [80.6, -35.5, -174.1], [77.7, -35.5, -177.0], [89.0, -35.6, -171.7]];
const SIGN_AT = [82, -31.0, -165.0];          // THE JUNCTION's sign, out over the door
const LAMP_AT = [86.0, -32.8, -172.3];        // the office's desk lamp, upstairs
const JUKEBOX_AT = [84.1, -35.8, -168.3];     // the dev stand-in's spot (the real one: js/jukebox.js, against the back wall)
const FLOOR_CAB = /^(fcab_|fc_)/;             // every cabinet on the Junction's floor (main.js's ids)

export class ArcadeAnswers {
  constructor({ cabs, O, listener, buffers, renderer, flashes, hooks }) {
    this.cabs = cabs; this.O = O; this.listener = listener; this.buffers = buffers; this.renderer = renderer; this.flashes = flashes;
    this.hooks = hooks || {};
    this.phase = 'idle'; this.t = 0; this.answered = false; this.clock = 0;
    this.knocks = {}; this.fx = [];
    this.initials = null; this.prep = null; this.shown = null; this.fromGlass = false;
    this.music = null;                 // the Junction's jukebox (a THREE.Audio), when there is one
    this.log = [];
    // a fresh room: the sign lit, the office dark (nobody home), the room's own light as baked
    if (O.signLight) O.signLight(1);
    if (O.officeLamp) O.officeLamp(0);
    if (O.roomLight) O.roomLight(1);
    this._toneReady();               // the tone's chip is built now, while the game loads (about 20 ms once), not on the moment
  }

  /** the step back is under way: nothing may take the player away from it */
  get locked() { return this.phase === 'step'; }
  /** every cabinet's tube is showing its answer table (main.js stops updating them) */
  get screensHeld() { return this.phase === 'answer'; }
  get busy() { return this.phase !== 'idle' && this.phase !== 'done'; }

  // ---------------------------------------------------------------- the knocks
  /** 1 the sign flickers, 2 the jukebox stutters, 3 the office lamp clicks on. Once each; true if it happened now */
  knock(n, delay = 0) {
    if (![1, 2, 3].includes(n) || this.knocks[n]) return false;
    this.knocks[n] = { at: +this.clock.toFixed(2) };
    this._note('knock ' + n);
    if (n === 1) this._signFlicker(delay);
    if (n === 2) this._stutter(delay);
    if (n === 3) this._lampOn(delay, true);
    return true;
  }
  _signFlicker(delay = 0) {
    const S = ANSWER.sign, O = this.O, dur = S.down + S.off + S.up;
    this.fx.push({ t: -delay, dur, start: () => { this._note('sign'); this._crackle(); },
      step: (u, t) => {
        const k = t < S.down ? 1 - (1 - S.low) * smooth(t / S.down) : t < S.down + S.off ? S.low : S.low + (1 - S.low) * smooth((t - S.down - S.off) / S.up);
        if (O.signLight) O.signLight(k); this.signK = k; this.signMin = Math.min(this.signMin ?? 1, k);
      }, end: () => { if (O.signLight) O.signLight(1); this.signK = 1; } });
  }
  /** the office lamp on (click: with its switch's sound) */
  _lampOn(delay = 0, click = true) {
    if (this.lampOn) return;
    this.lampOn = true;
    const L = ANSWER.lamp, O = this.O;
    this.fx.push({ t: -delay, dur: L.up + L.settle, start: () => { this._note('lamp'); if (click) this._click(); },
      step: (u, t) => { if (O.officeLamp) O.officeLamp(t < L.up ? 0.85 * smooth(t / L.up) : 0.85 + 0.15 * smooth((t - L.up) / L.settle)); },
      end: () => { if (O.officeLamp) O.officeLamp(1); } });
  }
  /** the jukebox catches on a slice of the song, three times, a breath of nothing, then plays on */
  _stutter(delay = 0) {
    this.fx.push({ t: -delay, dur: 0.01, start: () => {
      const a = this.music;
      if (!a || !a.isPlaying || !a.buffer) { this._note('stutter: no jukebox playing'); return; }
      const S = ANSWER.stutter, ctx = a.context, buf = a.buffer, now = ctx.currentTime;
      const pos = ((a._progress + Math.max(0, now - a._startedAt) * a.playbackRate) + (a.offset || 0)) % buf.duration;
      a.pause();
      const start = Math.max(0, pos - S.slice), t0 = now + 0.01;
      for (let i = 0; i < S.reps; i++) {
        const src = ctx.createBufferSource(), g = ctx.createGain(), at = t0 + i * S.slice;
        src.buffer = buf; src.playbackRate.value = a.playbackRate;
        g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(1, at + 0.004); g.gain.setValueAtTime(1, at + S.slice - 0.006); g.gain.linearRampToValueAtTime(0, at + S.slice);
        src.connect(g); g.connect(a.getOutput()); src.start(at, start, S.slice);
        src.onended = () => { try { src.disconnect(); g.disconnect(); } catch (e) { /* gone */ } };
      }
      a.play(S.reps * S.slice + S.gap);
      this.stutters = (this.stutters || 0) + 1;
      this._note('stutter');
    } });
  }

  // ---------------------------------------------------------------- the answer
  /** THE ARCADE ANSWERS with these initials. o.score: the source machine's #1 (a blank #1 takes it); o.skip: no moment at all,
   *  the tables filled quietly and straight to the van (the dev shortcuts). False if it already answered or is answering. */
  answer(initials, o = {}) {
    if (this.answered || this.busy) return false;
    this.initials = String(initials || 'AAA').toUpperCase().replace(/[^A-Z0-9 .]/g, '').padEnd(3, ' ').slice(0, 3);
    this.score = o.score || 0;
    this._note('answer ' + this.initials + (o.skip ? ' (skip)' : ''));
    if (o.skip) {
      this.answered = true; this.phase = 'done';
      this._commit();
      this.lampOn = true; if (this.O.officeLamp) this.O.officeLamp(1);
      if (this.hooks.done) this.hooks.done();
      return true;
    }
    this._prepTables();
    this.fromGlass = !!(this.hooks.atGlass && this.hooks.atGlass());
    this.phase = this.fromGlass ? 'step' : 'prep'; this.t = 0;
    if (this.fromGlass && this.hooks.stepBack) this.hooks.stepBack(ANSWER.step.secs, ANSWER.step);
    return true;
  }

  update(dt) {
    this.clock += dt;
    // the room's own effects (the sign, the lamp, the stutter, the dip, the jukebox catching again)
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i]; f.t += dt;
      if (f.t < 0) continue;
      if (!f.started) { f.started = true; if (f.start) f.start(); }
      if (f.step) f.step(Math.min(1, f.t / f.dur), f.t);
      if (f.t >= f.dur) { if (f.end) f.end(); this.fx.splice(i, 1); }
    }
    if (this.phase === 'idle' || this.phase === 'done') return;
    this.t += dt;
    const ready = !!(this.prep && this.prep.done);          // (the tables finish on one frame, the room answers on a later one)
    this._prepStep();
    switch (this.phase) {
      case 'step':
        if (this.t >= ANSWER.step.secs) { this.phase = 'settle'; this.t = 0; if (this.hooks.release) this.hooks.release(ANSWER.step); }
        break;
      case 'settle':
      case 'prep':
        if (ready && this.t >= (this.phase === 'settle' ? ANSWER.settle : 0)) this._fire();
        break;
      case 'answer':
        if (this.t >= ANSWER.hold) this._after();
        break;
    }
  }

  /** the floor's machines with a table: [id, cab, its rows as they will read with the initials at #1]. Nothing is written yet:
   *  a machine whose own attract is on its scores page during the step back must not show the initials before the moment */
  _plan() {
    const list = [];
    for (const [id, cab] of Object.entries(this.cabs)) if (FLOOR_CAB.test(id) && cab && cab.runner) list.push([id, cab, this._rowsFor(cab.runner.table)]);
    return list;
  }
  /** the score the initials take on a table (just over its old best, ending in 333; a blank #1 takes the source's score), or
   *  null when its #1 is them already (the source machine) */
  _scoreFor(T) {
    const top = T.entries[0];
    if (top && top.player && top.initials === this.initials.trim()) return null;
    if (T.topBlank) return Math.max(this.score || 0, (T.entries[1] ? T.entries[1].score : 0) + 10);
    return (Math.floor(T.top / 1000) + 1) * 1000 + 333;
  }
  _rowsFor(T) {
    const sc = this._scoreFor(T);
    if (sc === null) return T.entries;
    return [{ initials: this.initials, score: sc, player: true }, ...(T.topBlank ? T.entries.slice(1) : T.entries)].slice(0, 5);
  }
  /** the moment: every table keeps the initials at #1 from now on (once per table: a machine at home shares one) */
  _commit() {
    const seen = new Set();
    for (const [id, cab] of Object.entries(this.cabs)) {
      if (!FLOOR_CAB.test(id) || !cab || !cab.runner) continue;
      const T = cab.runner.table; if (seen.has(T)) continue; seen.add(T);
      const sc = this._scoreFor(T); if (sc === null) continue;
      if (T.topBlank) T.fillTop(this.initials, sc); else T.insert(sc, this.initials);
    }
  }
  _prepTables() {
    if (this.flashes && this.flashes.swap) this.flashes._swapTick(99);    // an A V R moment on a table ends now
    this.prep = { list: this._plan(), i: 0, tex: new Map(), done: false };
  }
  _prepStep() {
    const P = this.prep; if (!P || P.done) return;
    for (let n = 0; n < ANSWER.prepPerFrame && P.i < P.list.length; n++, P.i++) {
      const [id, cab, rows] = P.list[P.i];
      const tex = tableTexture(cab.runner.spec, rows);
      if (this.renderer && this.renderer.initTexture) this.renderer.initTexture(tex);
      P.tex.set(id, tex);
    }
    if (P.i >= P.list.length) P.done = true;
  }
  _fire() {
    this.phase = 'answer'; this.t = 0; this.answered = true;
    this._commit();
    // every tube at once
    this.shown = [];
    for (const [id, tex] of this.prep.tex) {
      const cab = this.cabs[id]; if (!cab) continue;
      cab.hold = null;                                            // (a machine's own hold, the name entry, lets go: the table is up)
      const u = cab.m.uniforms; u.map.value = tex; u.nextMap.value = tex; u.blend.value = 0;
      this.shown.push(id);
    }
    this._note('tables ' + this.shown.length);
    this._tone();
    // the jukebox skips: cut mid-note
    const a = this.music;
    if (a && a.isPlaying) { a.pause(); this.skipped = true; this._note('jukebox skip'); }
    // the lights dip for a breath (and if the office lamp never knocked, it is on when they come back up)
    const D = ANSWER.dip, O = this.O;
    this.fx.push({ t: 0, dur: D.down + D.hold + D.up,
      step: (u, t) => {
        const k = t < D.down ? 1 - (1 - D.low) * smooth(t / D.down) : t < D.down + D.hold ? D.low : D.low + (1 - D.low) * smooth((t - D.down - D.hold) / D.up);
        this.dipK = k; this.dipMin = Math.min(this.dipMin ?? 1, k); if (O.roomLight) O.roomLight(k);
        if (!this.lampOn && t >= D.down + D.hold) this._lampOn(0, false);
      },
      end: () => { this.dipK = 1; if (O.roomLight) O.roomLight(1); } });
  }
  _after() {
    // the tables go; each machine picks up its own attract where it was
    for (const id of this.shown || []) {
      const cab = this.cabs[id]; if (!cab) continue;
      const u = cab.m.uniforms; u.map.value = cab.t; u.nextMap.value = cab.t; u.blend.value = 0;
      cab.shown = false;                                          // (it redraws on its next update)
    }
    for (const tex of this.prep.tex.values()) tex.dispose();
    this.prep = null;
    this.phase = 'done'; this.t = 0;
    this._note('tables down');
    if (this.skipped && this.music) {
      const a = this.music;
      this.fx.push({ t: -ANSWER.resumeAfter, dur: 0.01, start: () => { if (!a.isPlaying) a.play(); this._note('jukebox on'); } });
    }
    if (this.hooks.done) this.hooks.done();
  }

  // ---------------------------------------------------------------- sound: the sign's crackle, the lamp's click, the tone
  _src(name, at, { off = 0, dur, gain = 1, lp = 3000, bp = null, ref = 3 } = {}) {
    const buf = this.buffers[name]; if (!buf || !this.listener) return false;
    try {
      const ctx = this.listener.context; if (ctx.state !== 'running') ctx.resume();
      const s = ctx.createBufferSource(); s.buffer = buf;
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp;
      const g = ctx.createGain(); g.gain.value = gain;
      const p = ctx.createPanner(); p.panningModel = 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = ref; p.rolloffFactor = 1; p.maxDistance = 10000;
      p.positionX.value = at[0]; p.positionY.value = at[1]; p.positionZ.value = at[2];
      let head = s;
      if (bp) { const b = ctx.createBiquadFilter(); b.type = 'bandpass'; b.frequency.value = bp; b.Q.value = 1.2; s.connect(b); head = b; }
      head.connect(f); f.connect(g); g.connect(p); p.connect(this.listener.getInput());
      const len = Math.min(dur || buf.duration, buf.duration - off);
      g.gain.setValueAtTime(gain, ctx.currentTime + Math.max(0, len - 0.02)); g.gain.linearRampToValueAtTime(0, ctx.currentTime + len);
      s.start(ctx.currentTime, off, len);
      s.onended = () => { try { s.disconnect(); f.disconnect(); g.disconnect(); p.disconnect(); } catch (e) { /* gone */ } };
      return true;
    } catch (e) { return false; }
  }
  // the neon's crackle as it drops out (the Handshake's own static, out on the street, faint through the glass)
  _crackle() { if (this._src('handshake/static_burst.mp3', SIGN_AT, { off: 0.42, dur: 0.24, gain: 0.55, lp: 2600, bp: 1900, ref: 4 })) this._note('crackle'); }
  // the lamp's switch, upstairs (a recorded lever click standing in until Daryll's own recordings)
  _click() { if (this._src('handshake/key_return.mp3', LAMP_AT, { gain: 1.4, lp: 3200, ref: 3 })) this._note('click'); }
  /** the tone's chip, routed out of the machines' places on the floor, its waves built ahead (at load, not on the moment) */
  _toneReady() {
    if (this.chip || !this.listener) return;
    try {
      const ctx = this.listener.context;
      this.chip = new Chip(ctx, { volume: ANSWER.tone.volume });
      const spread = ctx.createGain(); spread.gain.value = 1;
      for (const at of TONE_AT) {
        const p = ctx.createPanner(); p.panningModel = 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = 2.5; p.rolloffFactor = 1; p.maxDistance = 10000;
        p.positionX.value = at[0]; p.positionY.value = at[1]; p.positionZ.value = at[2];
        const g = ctx.createGain(); g.gain.value = ANSWER.tone.gain;
        spread.connect(g); g.connect(p); p.connect(this.listener.getInput());
      }
      this.chip.route(spread);
      this.chip.wave('tri'); this.chip.wave('pulse', 0.25);
    } catch (e) { console.warn('[answer] tone', e); }
  }
  /** one soft tone from every machine at once: the cabinets' own chip, out of their places on the floor */
  _tone() {
    if (!this.listener) return;
    this._toneReady();
    if (!this.chip) return;
    try {
      const ctx = this.listener.context;
      if (ctx.state !== 'running') ctx.resume();
      const H = ANSWER.tone.hz;
      this.chip.play({ label: 'The arcade answers', layers: [
        { wave: 'tri', f: H, env: { a: 0.09, d: 0.5, s: 0.7, h: 0.8, r: 1.6, v: 0.17 }, vib: { rate: 4.6, depth: 6, at: 0.5, fade: 0.6 } },
        { wave: 'pulse', duty: 0.25, f: H, env: { a: 0.12, d: 0.6, s: 0.5, h: 0.7, r: 1.4, v: 0.045 }, lp: 2200 },
        { wave: 'tri', f: H / 2, env: { a: 0.14, d: 0.7, s: 0.6, h: 0.6, r: 1.6, v: 0.12 } },
      ], max: 1, gap: 2 });
      this.toned = (this.toned || 0) + 1;
      this._note('tone');
    } catch (e) { console.warn('[answer] tone', e); }
  }

  // ---------------------------------------------------------------- dev and tests
  /** a stand-in jukebox for tests when the real one (js/jukebox.js) is absent: a song from near the door */
  devJukebox(on = true, name = 'juke_02.mp3') {
    if (!on) { if (this.music) { if (this.music.isPlaying) this.music.stop(); if (this.music.parent) this.music.parent.remove(this.music); } this.music = null; return null; }
    if (this.music) return this.music;
    const buf = this.buffers[name]; if (!buf || !this.listener) return null;
    const a = new THREE.PositionalAudio(this.listener); a.setRefDistance(2.5); a.setBuffer(buf); a.setLoop(true); a.setVolume(0.7);
    a.position.set(...JUKEBOX_AT); this.O.group.add(a); a.play();
    this.music = a;
    return a;
  }
  info(full = false) {
    return { phase: this.phase, answered: this.answered, knocks: { ...this.knocks }, lamp: !!this.lampOn,
      signK: this.signK ?? 1, signMin: this.signMin ?? 1, dipK: this.dipK ?? 1, dipMin: this.dipMin ?? 1, initials: this.initials,
      shown: this.shown ? this.shown.length : 0, tone: this.toned || 0, stutters: this.stutters || 0, skipped: !!this.skipped,
      music: this.music ? { playing: this.music.isPlaying } : null, ...(full ? { log: this.log.slice(-60) } : {}) };
  }
  _note(what) { this.log.push({ at: +this.clock.toFixed(2), what }); if (this.log.length > 120) this.log.shift(); }
}

// ---------------------------------------------------------------- a machine's high-score table, in its own colours and name
// (the SDK's own fonts and the game's palette, as its attract draws them: drawn once to a canvas, swapped onto the tube)
export function drawAnswerTable(s, spec, rows) {
  const pal = spec.palette, arc = PixelFont.Arcade, dsp = PixelFont.Display;
  s.noClip(); s.clear(pal.background);
  const k = AttractMode.fitScale(dsp, spec.name, 288, 3), x = 160 - idiv(dsp.measure(spec.name, k), 2), y = 22;
  s.text(spec.name, x + k, y + k, dsp, pal.dim, k);                       // hard shadow
  s.textTwoTone(spec.name, x, y, dsp, pal.highlight, pal.accent, 4, k);   // the title's chrome
  let yy = y + 7 * k + 10;
  s.textCentered('HIGH SCORES', 160, yy, arc, pal.text); yy += 12;
  s.dottedRule(40, 280, yy, 3, pal.accent); yy += 8;
  s.text('RANK', 48, yy, arc, pal.dim); s.text('SCORE', 108, yy, arc, pal.dim); s.text('NAME', 224, yy, arc, pal.dim); yy += 14;
  for (let i = 0; i < Math.min(5, rows.length); i++) {
    const r = rows[i], c = i === 0 ? pal.accent : pal.text, ry = yy + i * 22;
    s.text(AttractMode.Ranks[i], 48, ry, arc, c, 2);
    if (r.blank) continue;
    s.text(d6(r.score), 108, ry, dsp, c, 2);
    s.text(r.initials, 224, ry, dsp, c, 2);
  }
}
function tableTexture(spec, rows) {
  const s = new PixelSurface(); drawAnswerTable(s, spec, rows);
  const c = document.createElement('canvas'); c.width = 320; c.height = 240;
  c.getContext('2d').putImageData(new ImageData(s.data, 320, 240), 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.LinearFilter; t.generateMipmaps = false;
  return t;
}
