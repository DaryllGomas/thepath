// ascent_islands.js · THE REDRAW's painted structure for the ASCENT (resonance>ascent): the outlines of its floating islands, from
// the game's own layout (the collision hulls, where each island floats at rest). The wave's light flows into these lines, then hands
// its glow to the painted islands coming up under them (the lines settle: they fade as they land). Frame coords (1266 x 952).
import { ISLANDS, islandAt, islandPoly } from '../../games/ascent/layout.js';

export const ASCENT_ISLANDS = {
  color: [0.62, 0.42, 0.07], width: 5.5,
  lines: ISLANDS.map((d) => { const p = islandAt(d, 0), poly = islandPoly(p.x, p.y, d); return [...poly, poly[0]]; }),
};
