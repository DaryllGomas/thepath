// THE REDRAW · the six pairs of the cabinet's seven games: the options createRedraw takes for each transition.
//
//   import { REDRAW_PAIRS } from './cabinet/transition/pairs.js';
//   const rd = createRedraw(renderer, fromGame, toGame, { ...REDRAW_PAIRS['constellation>beacon'], lit: [0] });
//
// Keys are 'from>to' (game names). Each value: heartFrom (where the old game's light leaves from), heartTo (where the new
// picture forms first), index (the dot that lights: 0 for the first transition, 5 for ascent>tunnel; the 7th dot lights
// at the Tunnel's own passage), and where they help, fromStructure / toStructure (lines traced off a plate). `lit` (the
// dots already lit) is the host's: pass [0 .. index-1]. All coordinates are frame coords (1266 x 952).
import { STROKES } from '../games/constellation/layout.js';
import { HEARTH_CAVE } from './structure/hearth_cave.js';
import { ASCENT_ISLANDS } from './structure/ascent_islands.js';

const figure = STROKES.filter((s) => !s.glint).flatMap((s) => s.parts);

export const PAIR_ORDER = ['hearth>constellation', 'constellation>beacon', 'beacon>labyrinth', 'labyrinth>resonance', 'resonance>ascent', 'ascent>tunnel'];

export const REDRAW_PAIRS = {
  // Hearth's fire -> the Constellation's temple (approved; unchanged)
  'hearth>constellation': {
    index: 0, heartFrom: [627, 468], heartTo: [632, 770],
    fromStructure: { lines: HEARTH_CAVE.lines, color: HEARTH_CAVE.color, width: HEARTH_CAVE.width },
    toStructure: { lines: figure, color: [0.34, 0.21, 0.016], width: 5, eachOwn: true },
  },
  'constellation>beacon': { index: 1, heartFrom: [632, 770], heartTo: [660, 443] },
  'beacon>labyrinth': { index: 2, heartFrom: [660, 443], heartTo: [630, 460] },
  'labyrinth>resonance': {
    index: 3, heartFrom: [630, 460], heartTo: [633, 560],
    // the maze's central corridor (its horizontal axis) becomes the wave, line for line; the rest of the maze fades where it stands
    plan: { classes: { live: { staySurplus: true, unitLen: 60, spread: 0.12, spine: { pts: [[0, 462], [1266, 462]], weight: 12 } } } },
  },
  'resonance>ascent': {
    index: 4, heartFrom: [633, 480], heartTo: [633, 760],
    // the wave's light flows into the islands' edges (live lines that settle into the painting), so the glass is never dark
    toStructure: { lines: ASCENT_ISLANDS.lines, color: ASCENT_ISLANDS.color, width: ASCENT_ISLANDS.width, cls: 'live', settle: true, eachOwn: true },
    plan: { classes: { live: { spread: 0.16, unitLen: 45 } } },
  },
  'ascent>tunnel': { index: 5, heartFrom: [633, 520], heartTo: [633, 476] },
};
