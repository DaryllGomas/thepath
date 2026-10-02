// THE CABINET'S SOUND · the opt-in for the standalone pages: `?sound=1` loads this (nothing else does). It never touches a
// game's rules or pictures: it wraps game.update to LISTEN after each frame (GameSound reads game.events / game.sim).
//
//   hearth.html?sound=1 ... tunnel.html?sound=1     attachSound(game, 'hearth', { drive: window.__hearth.drive })
//   attract.html?sound=1                            attachAttractSound(A)        (the flower's breath and turn)
//   transition_test.html?sound=1                    attachRedrawSound(window.__transition)
// Sound starts on the first click or key (the browser's rule; Enter to start a game counts): the chip is MADE then, inside
// that event, so the browser never has to refuse an early start (no console warning). M mutes / unmutes.
// window.__sound = { chip (null until that first click / key), gs, ready, offlineRun(...) }: offlineRun plays the page's own
// bot for N seconds into an OfflineAudioContext and measures it (tools/sound_bots.mjs).
import { Chip } from './chip.js';
import { GameSound } from './gamesound.js';
import { PALETTES } from './index.js';
import { attractFrame, redrawFrame } from './palettes/cabinet_frames.js';
import { analyse } from './measure.js';

const QUIET_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'Escape', 'CapsLock', 'Tab', 'Fn', 'OS']);
/** Calls make() once, inside the first click / tap / key that can start audio. */
export function onGesture(make) {
  let done = false;
  const go = (e) => {
    if (done || (e.type === 'keydown' && QUIET_KEYS.has(e.key))) return;
    done = true;
    for (const t of ['pointerdown', 'keydown', 'touchend']) removeEventListener(t, go, true);
    make();
  };
  for (const t of ['pointerdown', 'keydown', 'touchend']) addEventListener(t, go, true);
}

function badge(api) {
  const f = document.querySelector('footer');
  if (!f) return;
  const s = document.createElement('span');
  s.id = 'sound-badge';
  const show = () => { const c = api.chip; s.textContent = !c ? '♪ sound: click or press a key' : c.volume < 0.01 ? '♪ muted (M)' : c.running ? '♪ sound on (M mutes)' : '♪ sound: click or press a key'; };
  show(); f.appendChild(s);
  setInterval(show, 500);
  let vol = 0.8;
  addEventListener('keydown', (e) => {
    const c = api.chip;
    if (e.code !== 'KeyM' || e.repeat || !c) return;
    if (c.volume > 0.01) { vol = c.volume; c.volume = 0; } else c.volume = vol || 0.8;
    setTimeout(show, 60);
  });
}

/** A game page (one of the seven): its game, its palette id, and (optional) its test drive() for offlineRun. */
export async function attachSound(game, id, o = {}) {
  let gs = null;
  const api = {
    chip: null, get gs() { return gs; }, id, ready: true,
    /** The page's own bot plays `seconds` with the sound going into an OfflineAudioContext; returns the measurements. */
    async offlineRun({ seconds = 60, bot = 'good', seed = 3, wav = false } = {}) {
      if (!o.drive) throw new Error('offlineRun: no drive()');
      const off = await Chip.offline(seconds + 4);
      off.log = [];
      const live = gs, run = new GameSound(off, PALETTES[id], { timeline: true });
      gs = run;
      try { o.drive({ bot, seed, max: seconds }); } finally { gs = live; }
      const buf = await off.ctx.startRendering();
      const data = buf.getChannelData(0);
      return {
        id, seconds, bot, seed, sampleRate: buf.sampleRate,
        measure: analyse(data, buf.sampleRate, { series: true }),
        timeline: run.timeline, log: off.log.map((v) => [v.key, +v.start.toFixed(4), +v.end.toFixed(4)]),
        counts: Object.fromEntries(run.counts), unmapped: Object.fromEntries(run.unmapped), missing: Object.fromEntries(run.missing),
        stats: { ...off.stats },
        pcm: wav ? (await import('./lab.js')).toBase64Pcm16(data) : null,
      };
    },
  };
  onGesture(() => { api.chip = Chip.live(); gs = new GameSound(api.chip, PALETTES[id]); });
  const update = game.update;
  game.update = function (dt, frame, opts) {
    const r = update.call(this, dt, frame, opts);
    if (gs) gs.frame(game, Math.min(Math.max(+dt || 0, 0), 0.1));
    return r;
  };
  badge(api);
  window.__sound = api;
  return api;
}

/** The cabinet's start screen (attract.html): the drone breathes with the flower, a shimmer while it turns. */
export async function attachAttractSound(A) {
  const { breathAt, twistAt } = await import('../seven/attract.js');
  const api = { chip: null, gs: null, ready: true };
  onGesture(() => { api.chip = Chip.live(); api.gs = new GameSound(api.chip, PALETTES.cabinet); });
  const update = A.update;
  A.update = function (dt, o) {
    const r = update.call(this, dt, o);
    if (api.gs) attractFrame(api.gs, { breath: breathAt(A.t), twist: twistAt(A.t) });
    return r;
  };
  badge(api);
  window.__sound = api;
  return api;
}

/** THE REDRAW test page: reads its state each animation frame (phase, u, the pair) and plays the rise, the chime, the settle. */
export async function attachRedrawSound(T) {
  const { REDRAW_DEFAULTS } = await import('../transition/redraw.js');
  const { REDRAW_PAIRS } = await import('../transition/pairs.js');
  const api = { chip: null, gs: null, ready: true };
  onGesture(() => { api.chip = Chip.live(); api.gs = new GameSound(api.chip, PALETTES.cabinet); });
  const tick = () => {
    if (api.gs) {
      const key = T.key || '', [from, to] = key.split('>'), P = REDRAW_PAIRS[key] || {};
      redrawFrame(api.gs, { phase: T.phase, u: T.u, index: P.index ?? 0, from, to, land: (P.light && P.light.to) ?? REDRAW_DEFAULTS.light.to });
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  badge(api);
  window.__sound = api;
  return api;
}
