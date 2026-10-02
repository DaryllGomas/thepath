// THE ARCADE ANSWERS · the trigger on STARVECTOR (the super-scaler, js/cabinet/games/starvector/). It reads the runner from outside
// and calls the room's API (js/answer.js): room.knock(1..3), room.answer(initials). (The old Asteroids-style game's version of
// this file is kept in js/cabinet/games/_retired/starvector_asteroids/.)
//
//   THE CLUE     the floor machine's high-score table is full except #1, which is blank ("always has been"); its attract
//                shows the table every ~32 s (the SDK's attract: js/cabinet/sdk/attractmode.js draws a held-blank row as its
//                rank alone). If you wander the floor a while (SV_TRIGGER.wander) without a quarter in it, the empty slot
//                glows softly gold on its glass.
//   THE KNOCKS   a symbol lights (sim.knocks): the circle (the ring beacon) = room.knock(1) the sign; the triangle (the three
//                frames) = room.knock(2) the jukebox; the square (the stones) = room.knock(3) the office lamp. After the square the
//                three symbols overlap into a diamond of light; fly in and the sim FREEZES (sim.frozen). The field stops: the name
//                entry comes up in the blank row (three letters: stick up / down, fire enters, B steps back), then
//                room.answer(initials) with the score.
import { PixelFont, AttractMode, SurfaceDraw, d6 } from './cabinet/sdk/index.js';

export const SV_TRIGGER = {
  wander: 180,                         // s on the floor without a quarter in Starvector before its empty slot glows
  table: [12840, 11260, 9780, 8350],   // the four names under the blank #1 (a won round scores 13,260 or more)
  attract: { demo: 16, scores: 9 },    // its attract on the floor: the table comes round every ~32 s, for 9 s
  knockDelay: 0.35,                    // s after a symbol lights (inside the game's flash)
  freezeAfter: 0.3,                    // s after the diamond is entered before the glass holds it (the light still settling)
  still: 1.1,                          // s the frozen field holds alone before the entry comes up
  rowsIn: 0.08,                        // s between the entry's rows appearing
  entered: 0.8,                        // s the filled row holds before the room answers
};
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export class StarvectorTrigger {
  constructor({ cab, room, hooks }) {
    this.cab = cab; this.room = room; this.hooks = hooks || {};
    this.R = cab && cab.runner;
    this.phase = 'idle'; this.t = 0; this.clock = 0;
    this.wanderT = 0; this.glowOn = false; this.coins = 0; this.lastWaves = 0;
    this.entry = null; this.initials = null; this.score = 0;
    if (!this.R) { console.warn('[starvector] no runner on the floor machine'); return; }
    // the clue: the top row held empty, the four under it a step below any won round
    const T = this.R.table;
    T.holdTop();
    T.entries.slice(1).forEach((e, i) => { if (SV_TRIGGER.table[i] !== undefined) e.score = SV_TRIGGER.table[i]; });
    this.R.attract.demoSeconds = SV_TRIGGER.attract.demo; this.R.attract.scoresSeconds = SV_TRIGGER.attract.scores;
    cab.overlay = (g) => this._glow(g);
  }

  /** from the freeze to the answer: the machine has you (no walking away) */
  get locked() { return ['freeze', 'still', 'entry', 'entered'].includes(this.phase); }

  /** a quarter went into the floor's Starvector */
  coin() { this.coins++; this.wanderT = 0; this.glowOn = false; this.lastWaves = 0; }

  update(dt, { inside = false } = {}) {
    if (!this.R) return;
    this.clock += dt;
    const room = this.room, R = this.R;
    // only if you wander: the empty slot glows gold (until a quarter goes in, or the arcade has answered)
    if (!room.answered && inside && this.phase === 'idle') {
      this.wanderT += dt;
      if (!this.glowOn && this.wanderT > SV_TRIGGER.wander) this.glowOn = true;
    }
    // the symbols of a round on the floor machine (not after the arcade has answered: then it is just a game)
    if (!room.answered && !room.busy && this.phase === 'idle' && R.phase === 'playing' && R.sim) {
      const sim = R.sim;
      if (sim !== this.simSeen) { this.simSeen = sim; this.lastWaves = sim.knocks | 0; sim.hi = R.table.top; }   // a restarted act keeps the symbols already earned
      const w = sim.knocks | 0;
      while (this.lastWaves < w) { this.lastWaves++; room.knock(this.lastWaves, SV_TRIGGER.knockDelay); }
      if (sim.frozen) { this.phase = 'freeze'; this.t = 0; }
    }
    if (this.phase === 'idle') return;
    this.t += dt;
    if (this.phase === 'freeze' && this.t >= SV_TRIGGER.freezeAfter) this._freeze();
    if (this.phase === 'entered' && this.t >= SV_TRIGGER.entered) {
      this.phase = 'answered'; this._finishRound();
      room.answer(this.initials, { score: R.table.entries[0].score });
    }
    if (this.phase === 'answered' && room.phase === 'done') this.phase = 'done';
  }

  // ---------------------------------------------------------------- the freeze and the name entry (on the cabinet's hold)
  _freeze() {
    const R = this.R;
    this.score = R.sim ? R.sim.score : 0;
    this.frozen = R.surface.data.slice();
    R.botDrives = false;
    this.entry = { slot: 0, letters: [0, 0, 0], armed: false, dir: 0, rep: 0, fire: false, back: false, t: 0 };
    this.phase = 'still'; this.t = 0;
    this.cab.hold = (dt, input) => this._hold(dt, input);
  }
  _hold(dt, input) {
    const s = this.R.surface;
    s.data.set(this.frozen);
    if (this.phase === 'still') {
      if (this.t < SV_TRIGGER.still) return;
      this.phase = 'entry'; this.t = 0; if (this.hooks.hint) this.hooks.hint('svEntry');
    }
    if (this.phase === 'entry') this._entryInput(dt, input);
    this._drawEntry(s);
  }
  _entryInput(dt, input) {
    const E = this.entry; E.t += dt;
    const up = input.y > 0.5, down = input.y < -0.5, fire = !!input.a, back = !!input.b;
    if (!E.armed) { if (!up && !down && !fire && !back) E.armed = true; return; }     // a fire still held from the last shot never enters a letter
    const step = (d) => { E.letters[E.slot] = (E.letters[E.slot] + d + LETTERS.length) % LETTERS.length; };
    const d = up ? 1 : down ? -1 : 0;
    if (d) {
      if (E.dir !== d) { E.dir = d; E.rep = 0.38; step(d); }
      else if ((E.rep -= dt) <= 0) { E.rep = 0.11; step(d); }
    } else E.dir = 0;
    if (fire && !E.fire) {
      E.slot++;
      if (E.slot >= 3) { this._entered(); E.fire = fire; return; }
      E.letters[E.slot] = E.letters[E.slot - 1];       // the next slot starts on the letter just entered
    }
    if (back && !E.back && E.slot > 0) E.slot--;
    E.fire = fire; E.back = back;
  }
  _entered() {
    this.initials = this.entry.letters.map((i) => LETTERS[i]).join('');
    // the slot fills: the blank top takes the player's score (never below the row under it)
    const T = this.R.table, under = T.entries[1] ? T.entries[1].score : 0;
    T.fillTop(this.initials, Math.max(this.score, under + 10));
    this.phase = 'entered'; this.t = 0;
    if (this.hooks.hint) this.hooks.hint(null);
  }
  _drawEntry(s) {
    const pal = this.R.spec.palette, arc = PixelFont.Arcade, dsp = PixelFont.Display;
    const C = (n) => pal.get(n), bg = C('bg'), navy = C('navy'), dimC = C('rockDim'), rock = C('rock'), white = C('white'), cyan = C('cyan'), cyanDim = C('cyanDim');
    const E = this.entry, entered = this.phase !== 'entry', t = E.t;
    s.noClip();
    s.plate(22, 24, 276, 192, bg, cyanDim); s.frame(24, 26, 272, 188, navy);
    s.textCentered('ENTER YOUR INITIALS', 160, 36, arc, cyan, 2);
    s.dottedRule(40, 280, 55, 3, navy);
    const rows = this.R.table.entries, shown = entered ? 5 : Math.min(5, Math.floor(t / SV_TRIGGER.rowsIn) + 1);
    for (let i = 0; i < shown; i++) {
      const y = 66 + i * 25;
      if (i === 0) {
        const c = entered ? cyan : white;
        s.text(AttractMode.Ranks[0], 40, y, arc, c, 2);
        s.text(d6(entered ? rows[0].score : this.score), 100, y, dsp, c, 2);
        for (let k = 0; k < 3; k++) {
          const x = 216 + k * 18;
          if (entered) { s.text(this.initials[k], x, y, dsp, cyan, 2); continue; }
          if (k < E.slot) s.text(LETTERS[E.letters[k]], x, y, dsp, white, 2);
          else if (k === E.slot) { s.text(LETTERS[E.letters[k]], x, y, dsp, cyan, 2); if (SurfaceDraw.blink(t)) s.rect(x, y + 17, 14, 2, cyan); }
          else s.rect(x, y + 17, 14, 2, cyanDim);
        }
        continue;
      }
      const r = rows[i]; if (!r) continue;
      s.text(AttractMode.Ranks[i], 40, y, arc, dimC, 2);
      s.text(d6(r.score), 100, y, dsp, rock, 2);
      s.text(r.initials, 216, y, dsp, rock, 2);
    }
    if (!entered) s.textCentered('STICK  LETTER     FIRE  ENTER', 160, 197, arc, dimC);
  }
  /** the round ends without its card: the runner goes back to its attract quietly (no win banner, no loss recorded). The
   *  name entry stays on the glass (the cabinet's hold) until the room puts the table up. */
  _finishRound() {
    const R = this.R, cab = this.cab;
    R.onRoundOver = null; cab.playing = false;
    if (R.phase === 'playing') R.abort();
    R.attract.lastScore = this.score;
  }

  // ---------------------------------------------------------------- the gold glow on the empty slot (Cabinet.overlay)
  _glow(g) {
    if (!this.glowOn || this.room.answered || this.phase !== 'idle') return;
    const R = this.R;
    if (R.phase !== 'attract' || R.attract.current !== AttractMode.Page.Scores || !R.table.topBlank) return;
    const breath = 0.5 - 0.5 * Math.cos(this.clock * Math.PI * 2 / 4.2);          // one slow breath every 4.2 s
    const a = 0.4 + 0.42 * breath;
    g.save(); g.globalCompositeOperation = 'lighter';
    // a soft halo over the empty row (the scores page's 1ST row, y 84..98), and a warmer core in it
    for (const [rx, sy, al, col] of [[136, 0.24, a * 0.7, '255,190,84'], [76, 0.15, a, '255,224,150']]) {
      g.setTransform(1, 0, 0, sy, 186, 91);
      const gr = g.createRadialGradient(0, 0, 0, 0, 0, rx);
      gr.addColorStop(0, `rgba(${col},${al.toFixed(3)})`); gr.addColorStop(0.55, `rgba(${col},${(al * 0.45).toFixed(3)})`); gr.addColorStop(1, `rgba(${col},0)`);
      g.fillStyle = gr; g.fillRect(-rx, -rx, rx * 2, rx * 2);
    }
    g.restore();
  }

  // ---------------------------------------------------------------- tests
  /** tests: fly straight to the end of the act on the glass (the gate is next); the sim's own bot / keys fly through it */
  clearWave() {
    const sim = this.R && this.R.sim; if (!sim || sim.frozen) return false;
    sim.toGate(); return true;
  }
  info() {
    return { phase: this.phase, wander: +this.wanderT.toFixed(1), glow: this.glowOn, coins: this.coins, waves: this.lastWaves,
      initials: this.initials, score: this.score,
      entry: this.entry ? { slot: this.entry.slot, letters: this.entry.letters.map((i) => LETTERS[i]).join('') } : null,
      top: this.R ? this.R.table.entries.map((e) => (e.blank ? '___' : e.initials) + ' ' + e.score) : null };
  }
}
