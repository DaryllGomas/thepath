// THE CABINET WITH NO NAME · its SOUND in the arcade: the one chip (js/cabinet/sound/), routed through a positional source at the
// cabinet's glass on the arcade's own AudioContext and listener, so it comes from the machine. Wiring only: no patch is changed.
//
//   const snd = new SevenSound({ ctx, out: listener.getInput() })       (main.js, after the player's first gesture)
//   seven.snd = snd                                                     (the tube calls it; nothing else needs to)
//   snd.place(x, y, z)                                                  the glass's centre in the room (world)
//   snd.update(camera, full, dt)                                        each frame: the source follows the listener toward the
//                                                                       centre of the view as the glide reaches full screen (0..1)
//   snd.pause(true | false)                                             the game's pause: the chip goes quiet and comes back
//
// What the tube tells it (js/cabinet/seven/index.js):
//   game(g, id, dt)     a game's frame while a credit plays (its palette, hung on its events as page.js does for the pages)
//   coin()              the on-screen chirp (the physical coin into the slot stays main.js's recording)
//   flower(on, A)       the start screen is on the glass: the drone follows its breath and counter-turn
//   redraw(state)       THE REDRAW: the rise, a step for each light, the chime as the dot lights, the settle in the next key
//   leave()             you walked away: the game's sounds stop (the drone, if the flower is up, goes on softly from the room)
//   retire(g)           a game is over and gone (its held sounds let go)
//   silence()           the run is won: everything off (the ending has its own sounds)
import { Chip } from '../sound/chip.js';
import { GameSound } from '../sound/gamesound.js';
import { PALETTES } from '../sound/index.js';
import { attractFrame, redrawFrame } from '../sound/palettes/cabinet_frames.js';
import { breathAt, twistAt } from './attract.js';

/** The arcade mix: the chip's own level (its output ceiling is about -5 dBFS at 0.8) and how the machine's sound falls off
 *  with distance. Linear falloff: full within `ref` of the glass, nothing at `max` (a real machine's attract is heard from a few
 *  steps, never across the arcade). */
export const SEVEN_MIX = { volume: 0.6, ref: 0.6, max: 7.5, rolloff: 1 };

export class SevenSound {
  constructor({ ctx, out, mix = {}, chip }) {
    this.mix = { ...SEVEN_MIX, ...mix };
    this.ctx = ctx;
    this.chip = chip || new Chip(ctx, { volume: this.mix.volume });
    this.panner = ctx.createPanner();
    const P = this.panner;
    P.panningModel = 'HRTF'; P.distanceModel = 'linear';
    P.refDistance = this.mix.ref; P.maxDistance = this.mix.max; P.rolloffFactor = this.mix.rolloff;
    this.chip.route(P);
    P.connect(out || ctx.destination);
    this.center = { x: 0, y: 1, z: 0 };
    this.full = 0; this.paused = false;
    this.gs = new Map();                            // game object -> its GameSound
    this.cab = new GameSound(this.chip, PALETTES.cabinet);
    this.flowerOn = false; this.rdActive = false;
    this.totals = {};                               // tests: plays per game palette over the whole run (kept when a game retires)
    this.log = null;                                // tests: [] to record { t, what }
    this.stats = { frames: 0, coins: 0, redraws: 0, leaves: 0 };
    this._applyPos({ x: 0, y: 1, z: 0 });
  }

  place(x, y, z) { this.center = { x, y, z }; }
  _applyPos(p) {
    const P = this.panner;
    if (P.positionX) { P.positionX.value = p.x; P.positionY.value = p.y; P.positionZ.value = p.z; } else P.setPosition(p.x, p.y, p.z);
  }
  /** cam: { position, quaternion } (three's camera). At full screen (full = 1) the machine sits dead ahead of the listener, at
   *  the distance it really is, so the sound is centred; away from it, it is where the cabinet stands. */
  update(cam, full = 0) {
    this.full = full;
    const C = this.center, p = cam.position;
    const dx = C.x - p.x, dy = C.y - p.y, dz = C.z - p.z, d = Math.hypot(dx, dy, dz) || 1;
    if (full <= 0) return this._applyPos(C);
    // the camera's forward, from its quaternion (0, 0, -1) rotated
    const q = cam.quaternion, fx = -2 * (q.x * q.z + q.w * q.y), fy = -2 * (q.y * q.z - q.w * q.x), fz = -(1 - 2 * (q.x * q.x + q.y * q.y));
    const k = full * full * (3 - 2 * full);
    this._applyPos({ x: C.x + (p.x + fx * d - C.x) * k, y: C.y + (p.y + fy * d - C.y) * k, z: C.z + (p.z + fz * d - C.z) * k });
  }
  pause(on) {
    if (on === this.paused) return;
    this.paused = on;
    this.chip.volume = on ? 0 : this.mix.volume;
  }
  _note(what) { if (this.log) this.log.push({ t: +this.ctx.currentTime.toFixed(3), what }); }

  // ------------------------------------------------------------ a game's frame (while a credit plays)
  game(g, id, dt) {
    if (this.paused) return;
    let s = this.gs.get(g);
    if (!s) {
      s = new GameSound(this.chip, PALETTES[id]); this.gs.set(g, s);
      // a round already at its ready card when you arrive (a credit waiting, parked): the ready call, once (a Start cue in the
      // same frame is the same call: the voice's gap drops the repeat)
      if (g.mode === 'play' && g.sim && g.sim.phase === 'ready') s.play('start');
    }
    s.frame(g, Math.min(Math.max(+dt || 0, 0), 0.1));
    this.stats.frames++;
  }
  _bank(s) {
    const T = this.totals[s.p.id] || (this.totals[s.p.id] = { counts: {}, unmapped: {}, missing: {} });
    for (const k of ['counts', 'unmapped', 'missing']) for (const [n, v] of s[k]) T[k][n] = (T[k][n] || 0) + v;
  }
  retire(g) { const s = this.gs.get(g); if (s) { s.stopAll(0.4); this._bank(s); this.gs.delete(g); } }
  /** You walked away: the game's held sounds let go, its one-shots fade at once; the cabinet's own keep going. */
  leave() {
    this.stats.leaves++;
    for (const s of this.gs.values()) { s.stopAll(0.25); this._bank(s); }
    this.gs.clear();
    const c = this.chip, t = c.now();
    for (const v of [...c.voices]) if (v.end > t && !String(v.key).startsWith('cabinet.')) c._steal(v, Math.max(t, v.start));
    this._note('leave');
  }
  silence() {
    this.leave(); this.flower(false);
    this.cab.stopAll(0.6);
  }

  // ------------------------------------------------------------ the cabinet's own moments
  coin() { if (this.paused) return; this.stats.coins++; this.cab.play('coin'); this._note('coin'); }
  /** The start screen is on the glass (on), with its flower A (attract.js): the drone breathes with it. */
  flower(on, A) {
    if (this.paused) return;
    if (on && A) {
      this.flowerOn = true;
      attractFrame(this.cab, { breath: breathAt(A.t), twist: twistAt(A.t) });
    } else if (this.flowerOn) {
      this.flowerOn = false;
      this.cab.stop('attractDrone', 1.5); this.cab.stop('attractShimmer', 1.2);
      this.cab.st.landed = undefined;
    }
  }
  /** THE REDRAW, as redrawFrame reads it: { phase: 'trans' | 'ready', u, index, from, to, land } (phase 'end' lets it reset). */
  redraw(state) {
    if (this.paused) return;
    if (state.phase === 'trans') this.rdActive = true;
    redrawFrame(this.cab, state);
    if (state.phase === 'ready') { this.stats.redraws++; this._note('settle'); this.cab.st.ph = null; this.rdActive = false; }
  }
}
