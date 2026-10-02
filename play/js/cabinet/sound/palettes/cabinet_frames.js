// THE CABINET'S SOUND · the cabinet's own moments, frame by frame (shared by the test pages now and the arcade host later):
//   attractFrame(gs, { breath, twist })          the start screen: breath 0..1 (breathAt(t)), twist = twistAt(t) or null
//   redrawFrame(gs, { phase, u, index, from, to, land })   THE REDRAW: phase 'hold' | 'trans' | 'ready', u 0..1,
//                                                 index = the dot that lights (the game just beaten), to = the next game's id
// gs is a GameSound on PALETTES.cabinet.
import { penta } from '../music.js';
import { ROOT_SEMIS } from './cabinet.js';

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

export function attractFrame(gs, { breath = 0, twist = null } = {}) {
  gs.drive('attractDrone', breath);
  gs.drive('attractShimmer', twist ? twist.soft : 0);
  if (twist && twist.land > 0.92 && gs.st.landed !== twist.n) { gs.st.landed = twist.n; gs.play('starLand'); }
}

const STEPS = 12;
/** When step k of the rise sounds (u): sparse at first, closer and closer as the light nears its dot. */
const stepAt = (k, land) => 0.03 + (land - 0.05) * (1 - Math.pow(1 - k / STEPS, 1.4));

export function redrawFrame(gs, { phase, u = 0, index = 0, from = '', to = '', land = 0.6 } = {}) {
  const st = gs.st, was = st.ph;
  if (phase === 'trans') {
    if (was !== 'trans') { st.steps = 0; st.chimed = false; }
    gs.drive('redraw', u);
    gs.level('redraw', 1 - smooth(0.68, 1, u), 0.12);
    const base = ROOT_SEMIS[from] ?? 0;
    while (st.steps < STEPS && u >= stepAt(st.steps, land)) { gs.play('redrawStep', { pitch: base + penta(st.steps) }); st.steps++; }
    if (!st.chimed && u >= land) { st.chimed = true; gs.play('redrawChime', { pitch: penta(index) }); }
  } else if (was === 'trans') {
    gs.stop('redraw', 0.9);
    if (phase === 'ready') gs.play('redrawSettle', { pitch: ROOT_SEMIS[to] ?? 0 });
  }
  st.ph = phase;
}
