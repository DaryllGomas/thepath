// THE NODE · THE ASCENT (cabinet level 6) · THE ROUND (ICabinetSim). Deterministic, headless, no DOM, no three.js.
//
// Lunar Lander + Joust, reshaped by the story: RAISE ATLANTIS. Twelve painted islands float and drift (slow bobbing, long slides).
// You start standing on a ledge (layout.js START) and fly a small lander: gravity always pulls down, THRUST pushes up (while there is fuel), LEFT / RIGHT steer (a side thrust with a
// lean). An island's top is solid: rest on it. Its sides and underside only bump you (never a death).
//   A SOFT LANDING on a top (slower than `soft.vy` and roughly level) sets you down and REFILLS the tank. Set down on an unlit
//   gold PAD it lights: the ring glows and its obelisk rises. A HARD landing (too fast, or tilted) crashes: a ship. The sea
//   below takes the ship too.
//   THE CRYSTALS (Joust) wander and slowly home in on you. Come down on one from ABOVE and it shatters (points, a bounce, a chain
//   while you stay airborne). The side or below costs a ship.
//   Light every pad: THE TEMPLE OPENS. One soft landing on it: ATLANTIS RISES (the win). Out of ships: ATLANTIS SLEEPS.
//
//   reset(seed, credit, knobs)   step(dt, pad)    pad = AscentPad (latched by the host): x (steer), y (up), a / b (thrust), start
//   read-only for views and bots: lander {x, y, vx, vy, tilt, landed (island id | -1), fuel, thrusting, side, alive, ward},
//   islands [{ def, id, x, y, vx, vy, dx, dy, lit, litAt, padOn }], crystals, padsLit, padsTotal, temple, phase, phaseTime,
//   time, levelTime, events, k, stats, score, livesLeft; softLimit, groundBelow(), islandById(id)
//
// FIXED TICK: step(dt) runs whole 1/60 s ticks, so a round plays the same at any frame rate.
import { CabinetState, RoundResult, SoundCue, CueBuffer, CreditInfo, KnobValues, SystemRandom } from '../../sdk/index.js';
import { TUNE } from './spec.js';
import { ISLANDS, START, START_ISLAND, islandAt, islandPoly, padX } from './layout.js';

const T = TUNE, STEP = T.step, L = T.lander;
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

/** The panel: a stick (x: left / right, y: up), THRUST (a, or b), START. Held states; latch() keeps this step and the last. */
export class AscentPad {
  constructor() { this.cur = AscentPad.frame(); this.prev = AscentPad.frame(); }
  static frame(o = {}) { return { x: clamp(+o.x || 0, -1, 1), y: clamp(+o.y || 0, -1, 1), a: !!o.a, b: !!o.b, start: !!o.start }; }
  latch(o) { this.prev = this.cur; this.cur = AscentPad.frame(o || {}); }
  clear() { this.cur = AscentPad.frame(); this.prev = AscentPad.frame(); }
  get x() { return this.cur.x; }
  get y() { return this.cur.y; }
  held(k) { return this.cur[k]; }
  pressed(k) { return this.cur[k] && !this.prev[k]; }
}

/** Circle (cx, cy, r) against a convex polygon: null, or { nx, ny, depth, x, y } (the way out, the nearest boundary point). */
export function circlePoly(cx, cy, r, poly) {
  let best = 1e18, bx = 0, by = 0, sign = 0, inside = true;
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n], ex = b[0] - a[0], ey = b[1] - a[1];
    const cr = ex * (cy - a[1]) - ey * (cx - a[0]);
    if (sign === 0) sign = cr >= 0 ? 1 : -1;
    if ((cr >= 0 ? 1 : -1) !== sign) inside = false;
    const u = clamp(((cx - a[0]) * ex + (cy - a[1]) * ey) / (ex * ex + ey * ey), 0, 1), px = a[0] + ex * u, py = a[1] + ey * u;
    const d = (cx - px) * (cx - px) + (cy - py) * (cy - py);
    if (d < best) { best = d; bx = px; by = py; }
  }
  const d = Math.sqrt(best), l = d || 1;
  if (inside) return { nx: (bx - cx) / l, ny: (by - cy) / l, depth: r + d, x: bx, y: by };
  if (d >= r) return null;
  return { nx: (cx - bx) / l, ny: (cy - by) / l, depth: r - d, x: bx, y: by };
}

export class AscentRound {
  constructor() {
    this._cues = new CueBuffer();
    this.reset(1, new CreditInfo(), new KnobValues());
  }

  reset(seed, credit, knobs) {
    this.seed = seed || 1;
    this.rng = new SystemRandom(this.seed);
    this.credit = credit || new CreditInfo();
    const k = knobs || new KnobValues();
    this.k = { soft: k.get('soft', 1), fuel: k.get('fuel', 1), crystal: k.get('crystal', 1), lives: Math.round(k.get('lives', T.lives)),
      pads: Math.round(k.get('pads', T.pads)), ward: k.get('ward', 0) };
    if (this.credit.unlosable) this.k.ward = 1;
    this._state = CabinetState.Intro; this.phase = 'ready'; this.phaseTime = 0; this.readyDur = T.ready;
    this._result = RoundResult.None; this._cues.resetTotals();
    this.time = 0; this.levelTime = 0; this.why = '';
    this.score = 0; this.livesLeft = this.k.lives;
    this.padsTotal = this.k.pads; this.padsLit = 0; this.open = 0; this.openAt = -9; this.chain = 0;
    this.islands = ISLANDS.map((def) => ({ def, id: def.id, x: def.x, y: def.y, vx: 0, vy: 0, dx: 0, dy: 0, lit: false, litAt: -9, open: false,
      padOn: def.kind === 'pad' && def.pad.order < this.padsTotal }));
    this.temple = this.islands[0];
    for (const s of this.islands) islandAt(s.def, 0, s);
    this.lander = { x: 0, y: 0, vx: 0, vy: 0, tilt: 0, landed: -1, fuel: T.fuel.max, thrusting: false, side: 0, alive: true, ward: 0, born: 0 };
    this._placeOnStart();
    this.crystals = []; this.nextId = 1; this.spawnT = T.crystal.first;
    this.events = []; this._acc = 0; this._almost = false; this._dryShown = false;
    this.stats = { softs: 0, crashes: 0, hard: 0, sea: 0, hit: 0, stomps: 0, lit: 0, warded: 0, bumps: 0, spawned: 0, deathsAt: [], litAt: [], dry: 0, bestChain: 0 };
  }

  // ---- ICabinetSim ----
  get state() { return this._state; }
  get result() { return this._result; }
  get lives() { return this._state === CabinetState.Over || this._state === CabinetState.Card ? 0 : Math.max(0, this.livesLeft); }
  get cues() { return this._cues; }
  get summary() {
    return `pads ${this.padsLit}/${this.padsTotal} score ${this.score} t ${this.levelTime.toFixed(1)} ships ${this.livesLeft} ` +
      `stomps ${this.stats.stomps} hard ${this.stats.hard} hit ${this.stats.hit} sea ${this.stats.sea} ` +
      `${this._result === RoundResult.Won ? 'CLEAR' : this._result === RoundResult.Lost ? 'LOST (' + this.why + ')' : ''}`;
  }
  collectStats(into) {
    const add = (n, v) => { into[n] = (into[n] || 0) + v; };
    add('seconds', this.levelTime); add('padsLit', this.padsLit); add('stomps', this.stats.stomps); add('hard', this.stats.hard);
    add('hit', this.stats.hit); add('sea', this.stats.sea); add('livesLeft', Math.max(0, this.livesLeft));
  }

  get softLimit() { return T.soft.vy * this.k.soft; }
  /** Soft = slower than the limit and roughly level (a very gentle touch is soft whatever the lean: a scrape is not a crash). */
  isSoft(vrel, tilt) { return vrel <= this.softLimit && (Math.abs(tilt) <= T.soft.tilt || vrel <= this.softLimit * T.soft.gentle); }
  islandById(id) { return this.islands[id]; }
  /** the island top nearest below the lander (its centre within the top's width): { isl, gap } or null */
  groundBelow(x = this.lander.x, y = this.lander.y, m = 0) {
    let best = null;
    for (const s of this.islands) {
      const hw = s.def.w / 2;
      if (x < s.x - hw - m || x > s.x + hw + m) continue;
      const gap = s.y - (y + L.r);
      if (gap < -6) continue;
      if (!best || gap < best.gap) best = { isl: s, gap };
    }
    return best;
  }

  step(dt, pad) {
    this.events.length = 0;
    this._cues.clear();
    this._acc += clamp(dt, 0, 0.25);
    while (this._acc >= STEP) { this._acc -= STEP; this._tick(pad); }
  }

  _moveIslands() {
    for (const s of this.islands) {
      const px = s.x, py = s.y;
      islandAt(s.def, this.time, s);
      s.dx = s.x - px; s.dy = s.y - py;
    }
  }

  // ---------------------------------------------------------------------------------------------------------------
  _tick(pad) {
    const dt = STEP;
    this.time += dt; this.phaseTime += dt;
    if (this._state === CabinetState.Over) return;
    this._moveIslands();
    this.open = this.temple.open ? Math.min(1, (this.time - this.openAt) / 1.6) : 0;
    if (this._state === CabinetState.Card) {
      this._carry();
      if (this.phaseTime >= (this._result === RoundResult.Won ? T.card.won : T.card.lost)) this._state = CabinetState.Over;
      return;
    }
    if (this._state === CabinetState.Intro) {
      this._carry();                               // (the lander rides the start ledge while READY is up)
      if (this.phaseTime >= this.readyDur) {
        this._state = CabinetState.Playing; this.phase = 'play'; this.phaseTime = 0;
        this.events.push({ kind: 'go' }); this._cues.emit(SoundCue.Start);
      }
      return;
    }
    if (this._state === CabinetState.Interlude) {
      if (this.phaseTime >= T.lost) {
        if (this.livesLeft <= 0) { this._end(RoundResult.Lost, this.why || 'ships'); return; }
        this._respawn();
        this._state = CabinetState.Intro; this.phase = 'ready'; this.phaseTime = 0; this.readyDur = T.readyAgain;
        this.events.push({ kind: 'again' });
      }
      return;
    }
    // THE PLAY
    this.levelTime += dt;
    this._lander(dt, pad);
    if (this._state !== CabinetState.Playing) return;
    this._crystals(dt);
    if (this._state !== CabinetState.Playing) return;
    this._spawnTick(dt);
  }

  _respawn() {
    const l = this.lander;
    Object.assign(l, { vx: 0, vy: 0, tilt: 0, landed: -1, fuel: T.fuel.max, thrusting: false, side: 0, alive: true, ward: 0, born: this.time });
    this._placeOnStart();
    this.chain = 0; this.spawnT = Math.max(this.spawnT, 2.2);
  }
  /** Stand the lander on the start ledge (right of its obelisk), feet on the walk line. */
  _placeOnStart() {
    const l = this.lander, s = this.islands[START_ISLAND.id];
    l.landed = s.id; l.x = s.x + START.dx; l.y = s.y - L.r;
  }
  _carry() {                                     // (a landed lander rides its island; the win's card keeps it on the temple)
    const l = this.lander;
    if (l.landed >= 0 && l.alive) { const s = this.islands[l.landed]; l.x += s.dx; l.y = s.y - L.r; }
  }

  // ---- the lander ----
  _lander(dt, pad) {
    const l = this.lander, F = T.fuel;
    const side = pad ? clamp(pad.x, -1, 1) : 0;
    const c = pad && (pad.cur ?? pad.current);
    const want = !!c && (c.a || c.b || c.y > 0.3);
    l.side += (side - l.side) * (1 - Math.exp(-dt / 0.06));
    const tiltT = l.side * 0.32 + clamp(l.vx / 260, -1, 1) * 0.14;
    l.tilt += (tiltT - l.tilt) * (1 - Math.exp(-dt / 0.12));
    if (l.ward > 0) l.ward = Math.max(0, l.ward - dt);
    if (l.landed >= 0) {
      const s = this.islands[l.landed], hw = s.def.w / 2;
      l.x += s.dx; l.y = s.y - L.r; l.vx = 0; l.vy = 0; l.thrusting = false;
      l.fuel = Math.min(F.max, l.fuel + F.refill * dt);
      if (want && l.fuel > 0) { l.landed = -1; l.vy = s.dy / dt - 50; l.vx = s.dx / dt; this.events.push({ kind: 'takeoff', x: l.x, y: l.y }); }
      else {
        l.x += side * L.walk * dt;
        if (Math.abs(l.x - s.x) > hw) l.landed = -1;      // walked off the edge: it falls
        else { this._lightCheck(s); return; }
      }
    }
    // in the air
    const burning = want && l.fuel > 0;
    l.thrusting = burning;
    if (want && l.fuel <= 0 && !this._dryShown) { this._dryShown = true; this.stats.dry++; this.events.push({ kind: 'dry' }); }
    if (l.fuel > 0.5 * F.max) this._dryShown = false;
    let ax = side * L.side, ay = L.g;
    if (burning) { ay -= L.thrust; l.fuel = Math.max(0, l.fuel - F.burn * this.k.fuel * dt); }
    if (side !== 0 && l.fuel > 0) l.fuel = Math.max(0, l.fuel - F.sideBurn * this.k.fuel * Math.abs(side) * dt);
    else if (side !== 0) ax *= 0.35;
    l.vx += ax * dt; l.vy += ay * dt;
    const dr = 1 - L.drag * dt; l.vx *= dr; l.vy *= dr;
    l.vx = clamp(l.vx, -L.maxVx, L.maxVx); l.vy = clamp(l.vy, -L.maxVy * 0.8, L.maxVy);
    l.x += l.vx * dt; l.y += l.vy * dt;
    const B = T.bounds;
    if (l.x < B.x0) { l.x = B.x0; l.vx = Math.abs(l.vx) * 0.3; }
    if (l.x > B.x1) { l.x = B.x1; l.vx = -Math.abs(l.vx) * 0.3; }
    if (l.y < B.y0) { l.y = B.y0; l.vy = Math.abs(l.vy) * 0.3; }
    // the islands: bump off the sides and the underside; the top is a landing
    for (const s of this.islands) {
      const hit = circlePoly(l.x, l.y, L.r, islandPoly(s.x, s.y, s.def));
      if (!hit) continue;
      l.x += hit.nx * hit.depth; l.y += hit.ny * hit.depth;
      const vrel = l.vy - s.dy / dt, vn = (l.vx - s.dx / dt) * hit.nx + vrel * hit.ny;
      if (hit.ny < -0.92 && vrel >= -5) {
        const ok = this.isSoft(vrel, l.tilt);
        if (ok || this._wardOn()) { this._land(s, ok); return; }
        this.stats.hard++;
        this._loseLife('hard', l.x, l.y);
        return;
      }
      if (vn < 0) {
        l.vx -= 1.35 * vn * hit.nx; l.vy -= 1.35 * vn * hit.ny;
        if (vn < -60) { this.stats.bumps++; this.events.push({ kind: 'bump', x: hit.x, y: hit.y, v: -vn }); this._cues.emit(SoundCue.Tick); }
      }
    }
    if (l.y > B.sea) { this.stats.sea++; this._loseLife('sea', l.x, B.sea); }
  }
  _wardOn() { return this.k.ward > 0 && this.livesLeft <= 1; }
  _land(s, soft) {
    const l = this.lander;
    l.landed = s.id; l.vx = 0; l.vy = 0; l.y = s.y - L.r; this.chain = 0;
    this.stats.softs++;
    this.events.push({ kind: 'soft', x: l.x, y: l.y, id: s.id, ward: !soft });
    this._cues.emit(SoundCue.Tick);
    this._lightCheck(s);
    if (this._state === CabinetState.Playing && s.id === 0 && this.temple.open) this._end(RoundResult.Won, 'atlantis');
  }
  _lightCheck(s) {
    if (!s.padOn || s.lit) return;
    const l = this.lander;
    if (Math.abs(l.x - (s.x + s.def.pad.dx)) > s.def.pad.r - 2) return;
    s.lit = true; s.litAt = this.time; this.padsLit++; this.stats.lit++; this.stats.litAt.push(+this.levelTime.toFixed(1));
    this.score += T.score.pad;
    this.events.push({ kind: 'light', id: s.id, x: padX(s.def, s.x), y: s.y, pts: T.score.pad, lit: this.padsLit, total: this.padsTotal });
    this._cues.emit(SoundCue.Bonus);
    const left = this.padsTotal - this.padsLit;
    if (left > 0 && left <= 2 && !this._almost) { this._almost = true; this.events.push({ kind: 'almost', left }); }
    if (left === 0) { this.temple.open = true; this.openAt = this.time; this.events.push({ kind: 'open' }); }
  }

  // ---- the crystals ----
  _crystals(dt) {
    const C = T.crystal, l = this.lander, B = T.bounds;
    for (let i = this.crystals.length - 1; i >= 0; i--) {
      const c = this.crystals[i], t = this.time + c.ph;
      const born = Math.min(1, (this.time - c.born) / C.fade);
      // wander (a slow closed-form heading) + a slow homing toward the lander
      const a = c.a0 + 1.25 * Math.sin(0.33 * t) + 0.8 * Math.sin(0.19 * t + 1.7);
      let dx = Math.cos(a), dy = Math.sin(a) * 0.7;
      if (l.alive) {
        const hx = l.x - c.x, hy = l.y - c.y, hd = Math.hypot(hx, hy) || 1;
        const h = C.home * (born < 1 ? 0.5 : 1);
        dx = dx * (1 - h) + (hx / hd) * h; dy = dy * (1 - h) + (hy / hd) * h;
      }
      const sp = C.speed * this.k.crystal * (1 + 0.25 * Math.min(1, this.levelTime / 60));
      c.vx += (dx * sp - c.vx) * (1 - Math.exp(-dt * 1.3)); c.vy += (dy * sp - c.vy) * (1 - Math.exp(-dt * 1.3));
      c.x += c.vx * dt; c.y += c.vy * dt;
      if (c.x < B.x0 - 10) { c.x = B.x0 - 10; c.vx = Math.abs(c.vx); }
      if (c.x > B.x1 + 10) { c.x = B.x1 + 10; c.vx = -Math.abs(c.vx); }
      if (c.y < B.y0 + 10) { c.y = B.y0 + 10; c.vy = Math.abs(c.vy); }
      if (c.y > B.sea - 70) { c.y = B.sea - 70; c.vy = -Math.abs(c.vy); }
      for (const s of this.islands) {
        const h = circlePoly(c.x, c.y, C.r, islandPoly(s.x, s.y, s.def));
        if (!h) continue;
        c.x += h.nx * h.depth; c.y += h.ny * h.depth;
        const vn = c.vx * h.nx + c.vy * h.ny; if (vn < 0) { c.vx -= vn * h.nx; c.vy -= vn * h.ny; }
      }
      c.trail.push([c.x, c.y]); if (c.trail.length > 90) c.trail.shift();
      if (!l.alive || born < 1) continue;
      // the lander meets it
      const rr = L.r * 0.85 + C.r, ddx = l.x - c.x, ddy = l.y - c.y;
      if (ddx * ddx + ddy * ddy > rr * rr) continue;
      const above = c.y - l.y >= C.hover && (l.vy - c.vy) >= -60 && l.landed < 0;
      if (above) {
        this.crystals.splice(i, 1);
        this.chain = Math.min(C.chainMax, this.chain + 1); this.stats.bestChain = Math.max(this.stats.bestChain, this.chain);
        const pts = C.stomp * this.chain; this.score += pts; this.stats.stomps++;
        l.vy = -C.bounce; l.vx *= 0.7;
        this.events.push({ kind: 'stomp', id: c.id, x: c.x, y: c.y, pts, chain: this.chain });
        this._cues.emit(SoundCue.Hit); if (this.chain >= 3) this._cues.emit(SoundCue.Bonus);
      } else if (this._wardOn()) {
        this.crystals.splice(i, 1); this.stats.warded++;
        this.events.push({ kind: 'ward', why: 'crystal', x: c.x, y: c.y, id: c.id }); this._cues.emit(SoundCue.Miss);
        if (l.landed < 0) l.vy = -80;
        l.ward = 1.5;
      } else {
        this.stats.hit++;
        this.crystals.splice(i, 1);
        this.events.push({ kind: 'hit', id: c.id, x: c.x, y: c.y });
        this._loseLife('crystal', l.x, l.y);
        return;
      }
    }
  }
  _spawnTick(dt) {
    const C = T.crystal, l = this.lander;
    this.spawnT -= dt;
    if (this.spawnT > 0) return;
    this.spawnT = C.every;
    const want = Math.round(C.want[0] + (C.want[1] - C.want[0]) * Math.min(1, this.levelTime / 30));
    if (this.crystals.length >= want) return;
    const left = this.rng.nextDouble() < 0.5, B = T.bounds;
    let y = 130 + this.rng.nextDouble() * 520;
    const x = left ? B.x0 + 6 : B.x1 - 6;
    if (Math.hypot(x - l.x, y - l.y) < 300) y = l.y < 400 ? 640 : 160;
    const c = { id: this.nextId++, x, y, vx: left ? 20 : -20, vy: 0, born: this.time, ph: this.rng.nextDouble() * 20, a0: (left ? 0 : Math.PI) + (this.rng.nextDouble() - 0.5), trail: [] };
    this.crystals.push(c); this.stats.spawned++;
    this.events.push({ kind: 'spawn', id: c.id, x, y });
  }

  // ---- a ship ----
  _loseLife(why, x, y) {
    const l = this.lander;
    if (this._wardOn()) {                                   // MERCY: the last ship is warded: it sets down on the temple
      this.stats.warded++;
      const t = this.temple; l.landed = t.id; l.x = t.x; l.y = t.y - L.r; l.vx = l.vy = 0; l.ward = 1.6; l.fuel = T.fuel.max;
      this.events.push({ kind: 'ward', why, x, y }); this._cues.emit(SoundCue.Miss);
      return;
    }
    this.chain = 0;
    l.alive = false; l.thrusting = false; this.livesLeft--; this.why = why; this.stats.crashes++;
    this.stats.deathsAt.push(+this.levelTime.toFixed(1));
    for (const c of this.crystals) this.events.push({ kind: 'gone', id: c.id, x: c.x, y: c.y });
    this.crystals.length = 0;
    this.events.push({ kind: 'lifeLost', why, x, y, left: this.livesLeft, vx: l.vx, vy: l.vy });
    this._cues.emit(SoundCue.Miss);
    this._state = CabinetState.Interlude; this.phase = 'lost'; this.phaseTime = 0;
  }

  _end(result, why) {
    this._result = result; this._state = CabinetState.Card; this.phase = 'card'; this.phaseTime = 0; this.why = why;
    if (result === RoundResult.Won) {
      const bonus = T.score.clear + T.score.shipLeft * Math.max(0, this.livesLeft) + Math.round(this.lander.fuel * T.score.fuelBonus);
      this.score += bonus; this.crystals.length = 0;
      this._cues.emit(SoundCue.Win); this.events.push({ kind: 'clear', bonus, lives: this.livesLeft });
    } else { this._cues.emit(SoundCue.Die); this.events.push({ kind: 'out', why }); }
  }
}
