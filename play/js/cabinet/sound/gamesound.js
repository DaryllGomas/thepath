// THE CABINET'S SOUND · a game's sound, bound to the game: each frame it reads what the game ALREADY says (game.events: the
// SDK cues and the round's own events) and what it shows (game.sim: the fire, the thrust, the wave ...), and plays its
// palette on the chip. It never writes to the game.
//
//   const gs = new GameSound(chip, HEARTH_SOUND)        (palettes: js/cabinet/sound/palettes/)
//   after each game.update(dt, ...):  gs.frame(game, dt)
//   gs.unmapped   events the palette has no entry for (tests: must stay empty)      gs.missing   sounds a handler asked for
//   gs.counts     plays per sound (tests)                                            gs.timeline  [t, voices] per frame (tests)
//
// THE MACHINE'S HABITS (every game): the attract demo is silent (sound only while a credit plays); a round that ends LOST
// is followed, once the game is back on its title, by the cabinet's INSERT COIN call; loops are released when play stops.
// PALETTE = { id, title, sounds: { name: patch }, cues: { Coin: fn | null ... }, events: { kind: fn | null }, silent: { kind:
//   'why it makes no sound' }, frame(gs, game, dt), begin(gs, game), end(gs, game) }
//   a handler: (gs, event, game) => { gs.play('name', { pitch, level, delay }) }
import { dbGain } from './chip.js';
import { SHARED } from './palettes/cabinet.js';

export class GameSound {
  constructor(chip, palette, o = {}) {
    this.chip = chip; this.p = palette;
    this.mix = dbGain(palette.mix || 0);        // the game's trim (evens loudness across the seven); the shared cabinet voice keeps its own level
    this.clock = o.clock || (chip.offline ? 'sim' : 'ctx');
    this.t = o.t0 || 0;
    this.loops = new Map();
    this.mode = null; this.lost = false;
    this.st = {};                                   // the palette's own scratch (reset every credit)
    this.unmapped = new Map(); this.missing = new Map(); this.counts = new Map();
    this.timeline = o.timeline ? [] : null;
    let a = (o.seed ?? 0xC0FFEE) | 0;
    this.rand = () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  /** The game's trim applies to its own sounds; the shared family and the round-end sounds (group 'end') keep one level on every game. */
  mixOf(name) { return SHARED.has(name) || this.p.sounds[name]?.group === 'end' ? 1 : this.mix; }
  now() { return this.clock === 'sim' ? this.t : this.chip.now(); }

  play(name, o = {}) {
    const P = this.p.sounds[name];
    if (!P) { this.missing.set(name, (this.missing.get(name) || 0) + 1); return null; }
    this.counts.set(name, (this.counts.get(name) || 0) + 1);
    return this.chip.play(P, { ...o, level: (o.level ?? 1) * this.mixOf(name), when: this.now() + (o.delay || 0), key: this.p.id + '.' + name });
  }
  loop(name) {
    let h = this.loops.get(name);
    if (!h || h.stopped) {
      const P = this.p.sounds[name];
      if (!P) { this.missing.set(name, (this.missing.get(name) || 0) + 1); return null; }
      h = this.chip.loop(P, { when: this.now(), key: this.p.id + '.' + name, level: this.mixOf(name) });
      this.loops.set(name, h);
    }
    return h;
  }
  drive(name, x, glide) { const h = this.loop(name); if (h) h.drive(x, glide, this.now()); return h; }
  level(name, m, glide) { const h = this.loops.get(name); if (h) h.gain(m, glide, this.now()); }
  bend(name, cents, glide) { const h = this.loops.get(name); if (h) h.bend(cents, glide, this.now()); }
  stop(name, release) { const h = this.loops.get(name); if (h) { h.stop(release, this.now()); this.loops.delete(name); } }
  stopAll(release = 0.5) { for (const h of this.loops.values()) h.stop(release, this.now()); this.loops.clear(); }
  duck(level, seconds) { this.chip.duck('main', level, seconds, this.now()); }

  frame(game, dt) {
    this.t += dt;
    if (this.clock === 'sim') this.chip.clock = this.t;
    const mode = game.mode;
    if (mode !== this.mode) {
      const was = this.mode;
      this.mode = mode;
      if (mode === 'play') { this.lost = false; this.st = {}; this.duck(1, 0.2); this.p.begin?.(this, game); }
      else if (was === 'play') {
        this.stopAll(0.8); this.p.end?.(this, game); this.duck(1, 0.6);
        if (this.lost) this.play('insertCoin', { delay: 0.4 });
      }
    }
    for (const e of game.events) {
      const cue = e.kind === 'cue', k = cue ? e.name : e.kind, table = cue ? this.p.cues : this.p.events;
      if (k === 'out') this.lost = true; else if (k === 'clear') this.lost = false;
      const h = table[k];
      if (typeof h === 'function') h(this, e, game);
      else if (h === undefined) this.unmapped.set(k, (this.unmapped.get(k) || 0) + 1);
    }
    if (mode === 'play' && this.p.frame && game.sim) this.p.frame(this, game, dt);
    if (this.timeline) this.timeline.push([+this.t.toFixed(4), this.chip.voicesAt(this.now())]);
  }
}
