// THE CABINET'S SOUND · the floor's games, bound to a CabinetRunner (THE JUNCTION's machines in main.js, and play.html).
//
//   const P = await floorPalette('castlecrush')      the game's own palette (js/cabinet/games/<id>/sound.js: export SOUND),
//                                                    or the floor's stock one (palettes/floor.js) in a key of its own
//   const g = floorGame(runner)                      what GameSound reads each frame: { mode, sim, events }
//   gs.frame(g, dt)                                  after runner.step(): the cues it just emitted, the sim's own events
//                                                    (sim.recordEvents is switched on), and one { kind: 'out' } when a round
//                                                    ends LOST
import { floorSound, floorRoot } from './palettes/floor.js';

const cache = new Map();
export function floorPalette(id, title) {
  if (!cache.has(id)) {
    cache.set(id, import('../games/' + id + '/sound.js')
      .then((m) => m.SOUND || m.default)
      .catch(() => null)
      .then((P) => P || floorSound(id, title || id.toUpperCase(), floorRoot(id))));
  }
  return cache.get(id);
}

export function floorGame(runner) {
  let sim = null, told = false;
  return {
    runner,
    get mode() { return runner.phase === 'playing' ? 'play' : 'attract'; },
    get sim() { return runner.sim; },
    get events() {
      const s = runner.sim;
      if (s !== sim) { sim = s; told = false; if (s) s.recordEvents = true; }
      const ev = s && Array.isArray(s.events) ? s.events.splice(0) : [];
      for (const c of runner.cues) ev.push({ kind: 'cue', name: c });
      if (s && !told && s.result === 1 && runner.phase !== 'attract') { told = true; ev.push({ kind: 'out' }); }   // RoundResult.Lost
      return ev;
    },
  };
}
