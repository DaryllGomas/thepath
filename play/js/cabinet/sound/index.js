// THE CABINET'S SOUND · everything, one import.
//   import { Chip, GameSound, PALETTES } from './js/cabinet/sound/index.js';
//   const chip = await Chip.create(); chip.unlock();
//   const gs = new GameSound(chip, PALETTES.hearth);   after each game.update(): gs.frame(game, dt)
// The standalone pages use js/cabinet/sound/page.js (opt-in with ?sound=1); the audition page is /sound_test.html.
export { Chip, CHIP } from './chip.js';
export { GameSound } from './gamesound.js';
export { hz, semis, JI, PENTA, penta, pentaMinor } from './music.js';
import { CABINET_SOUND } from './palettes/cabinet.js';
import { HEARTH_SOUND } from './palettes/hearth.js';
import { CONSTELLATION_SOUND } from './palettes/constellation.js';
import { BEACON_SOUND } from './palettes/beacon.js';
import { LABYRINTH_SOUND } from './palettes/labyrinth.js';
import { RESONANCE_SOUND } from './palettes/resonance.js';
import { ASCENT_SOUND } from './palettes/ascent.js';
import { TUNNEL_SOUND } from './palettes/tunnel.js';
import { STARVECTOR_SOUND } from './palettes/starvector.js';
export { ROOTS, ROOT_SEMIS, GAME_ORDER, dotPitch } from './palettes/cabinet.js';

export const PALETTES = Object.freeze({
  hearth: HEARTH_SOUND, constellation: CONSTELLATION_SOUND, beacon: BEACON_SOUND, labyrinth: LABYRINTH_SOUND,
  resonance: RESONANCE_SOUND, ascent: ASCENT_SOUND, tunnel: TUNNEL_SOUND, starvector: STARVECTOR_SOUND, cabinet: CABINET_SOUND,
});
