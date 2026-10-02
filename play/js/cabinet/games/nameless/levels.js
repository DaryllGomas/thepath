// THE NODE · the cabinet with no name · THE FIVE LEVELS, as data (docs/THE_GAME/polybius/POLYBIUS_BUILD_SPEC).
// The cartridge never shows a level's dev name: the tube shows only I, II, III, IV, V.
//
// Units are the cabinet's logical 320x240 screen: the field is centred at (160, 120). Angles are DEGREES,
// 0 = 3 o'clock, growing CLOCKWISE on the screen (y is down). The probe starts at 90 (6 o'clock) on ring 0.
//
//   rings[i]   { r, spin }       radius, and spin in degrees per second (+ = clockwise). Ring 0 is the outer ring.
//   time       the level clock in seconds (mercy stretches it; the unlosable credit has none). Level I is generous
//              (it is where a stranger finds out what the buttons do); II-V sit near the first-timer bot's 80th
//              percentile, so a first coin is hard but possible (lab/nameless.mjs)
//   tol        PULSE tolerance in degrees measured on a radius-100 ring; smaller rings get a wider angle
//              (the same arc length), capped at x1.8
//   nodes[]    { id, sym, ring, a, symB? }   sym = the node's symbol (phase A), symB = its phase-B face (level V)
//   seq        the eight symbols to PULSE, in order. ANY node showing the symbol counts: duplicates are choices.
//              Mercy cuts the tail (8 -> 7 -> 6).
//   twist      what this level adds (one each):
//              rotation (I), counter-rotation (II), migrate (III: nodes glide between rings on a clock),
//              mirror (IV: the probe has a twin reflected top-to-bottom; a pulse fires from both), phase (V:
//              every node shows two faces, A and B, and the field turns between them on a clock)
//   school     the sacred forms the renderer builds the level's picture from (the curriculum, drawn only)
//   map        THE HIDDEN MAP (PLACEHOLDER, to be designed in its own session; see NOTES.md). Seven relationships
//              { position (deg), interval (beats at 108 BPM), direction (+1/-1), accent (0-3) }; `exposed` is how
//              many of the seven this level lets through. The renderer turns them into seven faint accents on the
//              clock ring that brighten on their beats. Never a literal diagram.
//
// Curriculum (LOCKED CANON v1 §7): point/division -> relationship/intersection -> repetition/generation ->
// network/correspondence -> whole/resonance.

export const SYMBOLS = Object.freeze(['diamond', 'triangle', 'circle', 'square', 'hexagon', 'pentagon', 'spiral']);

// the seven relationships (placeholder values: a heptagon of positions, Fibonacci intervals, alternating turns)
export const MAP7 = Object.freeze([
    Object.freeze({ position: 0.0, interval: 1, direction: +1, accent: 3 }),
    Object.freeze({ position: 51.4, interval: 2, direction: -1, accent: 1 }),
    Object.freeze({ position: 102.9, interval: 3, direction: +1, accent: 2 }),
    Object.freeze({ position: 154.3, interval: 5, direction: -1, accent: 1 }),
    Object.freeze({ position: 205.7, interval: 8, direction: +1, accent: 2 }),
    Object.freeze({ position: 257.1, interval: 13, direction: -1, accent: 1 }),
    Object.freeze({ position: 308.6, interval: 21, direction: +1, accent: 3 }),
]);
const map = (exposed) => ({ exposed, slots: MAP7 });

export const LEVEL_DATA = {
    version: 1,
    bpm: 108,
    defaults: {
        probeSpeed: 150,        // degrees per second
        pulseCooldown: 0.34,    // seconds: never more than ~3 pulses (and pulse lights) a second
        shiftCooldown: 0.16,
        tolRefRadius: 100,
        tolMaxScale: 1.8,
        migrateTravel: 1.2,     // seconds a node spends between rings (not hittable)
        openSpinDown: 0.9,      // the core opens: every ring decelerates to stillness over this
    },
    levels: [
        {
            id: 'division', number: 1, numeral: 'I', twist: 'rotation',
            time: 70, tol: 14,
            rings: [{ r: 100, spin: 4 }, { r: 58, spin: 0 }],
            nodes: [
                { id: 'a', sym: 'triangle', ring: 0, a: 90 },
                { id: 'b', sym: 'diamond', ring: 0, a: 210 },
                { id: 'c', sym: 'square', ring: 0, a: 330 },
                { id: 'd', sym: 'circle', ring: 1, a: 270 },
                { id: 'e', sym: 'hexagon', ring: 1, a: 30 },
                { id: 'f', sym: 'diamond', ring: 1, a: 150 },
            ],
            // the first target sits in front of you (learn PULSE), the second is on the inner ring (learn SHIFT),
            // the third needs an orbit (learn the stick)
            seq: ['triangle', 'circle', 'diamond', 'square', 'hexagon', 'triangle', 'circle', 'diamond'],
            school: ['point', 'seed', 'hexagram', 'division'],
            map: map(3),
        },
        {
            id: 'intersection', number: 2, numeral: 'II', twist: 'counter-rotation',
            time: 52, tol: 13,
            rings: [{ r: 100, spin: 8 }, { r: 62, spin: -6 }],
            nodes: [
                { id: 'a', sym: 'circle', ring: 0, a: 0 },
                { id: 'b', sym: 'square', ring: 0, a: 90 },
                { id: 'c', sym: 'triangle', ring: 0, a: 180 },
                { id: 'd', sym: 'hexagon', ring: 0, a: 270 },
                { id: 'e', sym: 'diamond', ring: 1, a: 45 },
                { id: 'f', sym: 'pentagon', ring: 1, a: 135 },
                { id: 'g', sym: 'circle', ring: 1, a: 225 },
                { id: 'h', sym: 'square', ring: 1, a: 315 },
            ],
            seq: ['square', 'pentagon', 'circle', 'triangle', 'diamond', 'hexagon', 'square', 'circle'],
            school: ['vesicas', 'flower19', 'intersections'],
            map: map(4),
        },
        {
            id: 'generation', number: 3, numeral: 'III', twist: 'migrate',
            time: 74, tol: 12,
            rings: [{ r: 100, spin: 7 }, { r: 72, spin: -5 }, { r: 44, spin: 3 }],
            nodes: [
                { id: 'a', sym: 'diamond', ring: 0, a: 15 },
                { id: 'b', sym: 'circle', ring: 0, a: 105 },
                { id: 'c', sym: 'square', ring: 0, a: 195 },
                { id: 'd', sym: 'triangle', ring: 0, a: 285 },
                { id: 'e', sym: 'hexagon', ring: 1, a: 60 },
                { id: 'f', sym: 'spiral', ring: 1, a: 180 },
                { id: 'g', sym: 'pentagon', ring: 1, a: 300 },
                { id: 'h', sym: 'triangle', ring: 2, a: 0 },
                { id: 'i', sym: 'circle', ring: 2, a: 120 },
                { id: 'j', sym: 'diamond', ring: 2, a: 240 },
            ],
            // symbols that move between rings: each walks its `path` of rings, resting `period - travel` s on each
            migrate: [
                { node: 'f', path: [1, 0], period: 8, offset: 3 },
                { node: 'g', path: [1, 2], period: 9, offset: 6 },
                { node: 'i', path: [2, 1], period: 10, offset: 1 },
            ],
            seq: ['spiral', 'triangle', 'circle', 'pentagon', 'spiral', 'diamond', 'hexagon', 'square'],
            school: ['polygons', 'spirals', 'phyllotaxis', 'flower19'],
            map: map(5),
        },
        {
            id: 'correspondence', number: 4, numeral: 'IV', twist: 'mirror',
            time: 70, tol: 11,
            rings: [{ r: 100, spin: 8 }, { r: 72, spin: -6 }, { r: 44, spin: 4 }],
            mirror: true,
            nodes: [
                { id: 'a', sym: 'triangle', ring: 0, a: 0 },
                { id: 'b', sym: 'circle', ring: 0, a: 72 },
                { id: 'c', sym: 'square', ring: 0, a: 144 },
                { id: 'd', sym: 'hexagon', ring: 0, a: 216 },
                { id: 'e', sym: 'diamond', ring: 0, a: 288 },
                { id: 'f', sym: 'pentagon', ring: 1, a: 36 },
                { id: 'g', sym: 'triangle', ring: 1, a: 156 },
                { id: 'h', sym: 'spiral', ring: 1, a: 276 },
                { id: 'i', sym: 'circle', ring: 2, a: 96 },
                { id: 'j', sym: 'square', ring: 2, a: 216 },
            ],
            seq: ['square', 'circle', 'triangle', 'pentagon', 'diamond', 'spiral', 'hexagon', 'triangle'],
            school: ['metatron', 'startetra', 'mirroraxis'],
            map: map(6),
        },
        {
            id: 'resonance', number: 5, numeral: 'V', twist: 'phase',
            time: 86, tol: 10,
            rings: [{ r: 100, spin: 9 }, { r: 72, spin: -7 }, { r: 44, spin: 5 }],
            phase: { period: 8, blend: 0.9 },      // A for ~3.1 s, a 0.9 s turn, B for ~3.1 s, a turn back
            nodes: [
                { id: 'a', sym: 'diamond', symB: 'circle', ring: 0, a: 10 },
                { id: 'b', sym: 'hexagon', symB: 'triangle', ring: 0, a: 100 },
                { id: 'c', sym: 'triangle', symB: 'square', ring: 0, a: 190 },
                { id: 'd', sym: 'circle', symB: 'diamond', ring: 0, a: 280 },
                { id: 'e', sym: 'square', symB: 'pentagon', ring: 1, a: 55 },
                { id: 'f', sym: 'pentagon', symB: 'hexagon', ring: 1, a: 145 },
                { id: 'g', sym: 'spiral', symB: 'diamond', ring: 1, a: 235 },
                { id: 'h', sym: 'diamond', symB: 'spiral', ring: 1, a: 325 },
                { id: 'i', sym: 'hexagon', symB: 'circle', ring: 2, a: 30 },
                { id: 'j', sym: 'circle', symB: 'triangle', ring: 2, a: 150 },
                { id: 'k', sym: 'triangle', symB: 'square', ring: 2, a: 270 },
            ],
            seq: ['triangle', 'pentagon', 'circle', 'spiral', 'hexagon', 'diamond', 'square', 'circle'],
            school: ['sriyantra', 'flower37', 'metatron', 'lotus'],
            // THE FLASH (canon 07 §6): once, when resonance first reaches 4 here, the lattice's negative space
            // suggests THE GATE for under a second. Renderer only; never highlighted.
            echoAtResonance: 4,
            map: map(7),
        },
    ],
};

export const LEVELS = LEVEL_DATA.levels;
