// THE NODE · world 1 · IRON DOJO (Ironclad Amusements, 1985) · THE PAGODA: the five floors and their masters (data only).
//
// A coin climbs a five-floor pagoda. Every floor is one scrolling hall with its own decor (the renderer's `theme`),
// its own mix of attackers, its own hazard and its own master at the far end, by the stairs:
//   1 THE RED HALL       grabbers, rollers, a thrower now and then               THE STICK MASTER: parries, then swings
//   2 THE LANTERN HALL   + pots drop from the rafters (snakes, fire-lizards, tea)  THE RING DANCER: a steel ring, out and back
//   3 THE MIRROR ROOM    + mirror ghosts step out of the glass                     THE GIANT: a swat, and a slam that runs the boards
//   4 THE BAMBOO ROOF    + wind gusts push you back, blades fly in off the roof    TWIN BLADES: a double slash, a thrown blade
//   5 THE GOLDEN HALL    everything at once, shorter, faster                       THE IRON MASTER: blocks, counters, and at half
//                                                                                  strength a palm of fire, high or low
// The floors alternate direction as the pagoda's stairs do: odd floors fight LEFT, even floors fight RIGHT (the sim
// always runs leftward; `mirror` flips the stick and the picture).
//
// Floor fields: length (px door to stairs), time (s a life), gap (mean s between arrivals), maxFoes, pair (chance a
// grabber brings a partner), speed (x every attacker's approach), mix (weights: grabber, thrower, dwarf, ghost),
// throwers (at most at once), pots (mean s between falling pots, 0 = none), blades (mean s between flying blades),
// wind (gusts), boss (BOSSES index), hint (two lines at most, 30 characters each).

export const BossKind = Object.freeze({ Stick: 0, Ring: 1, Giant: 2, Twin: 3, Master: 4 });

// tell = the wind-up seconds before the base telegraph knob (x bossTell); reach in px from his centre; body = how
// close you can stand; prefer = the range he likes to fight at
export const BOSSES = Object.freeze([
    Object.freeze({ kind: BossKind.Stick, name: 'THE STICK MASTER', hp: 6, walk: 34, retreat: 44, prefer: 42, reach: 52, body: 18,
        tell: 0.56, swing: 0.16, recover: 0.55, hurt: 0.35, damage: 3, score: 2000 }),
    Object.freeze({ kind: BossKind.Ring, name: 'THE RING DANCER', hp: 8, walk: 40, retreat: 46, prefer: 92, reach: 44, body: 18,
        tell: 0.44, throwTell: 0.6, swing: 0.16, recover: 0.5, hurt: 0.35, damage: 2, ringSpeed: 130, ringRange: 150, score: 3000 }),
    Object.freeze({ kind: BossKind.Giant, name: 'THE GIANT', hp: 14, walk: 22, retreat: 24, prefer: 48, reach: 60, body: 26,
        tell: 0.72, slamTell: 0.9, swing: 0.2, recover: 0.85, hurt: 0.4, damage: 4, slamDamage: 3, waveSpeed: 115, stagger: 3, score: 4000 }),
    Object.freeze({ kind: BossKind.Twin, name: 'TWIN BLADES', hp: 10, walk: 42, retreat: 50, prefer: 44, reach: 48, body: 18,
        tell: 0.5, gap: 0.24, throwTell: 0.55, swing: 0.14, recover: 0.5, hurt: 0.3, damage: 2, bladeSpeed: 150, score: 5000 }),
    Object.freeze({ kind: BossKind.Master, name: 'THE IRON MASTER', hp: 12, walk: 36, retreat: 48, prefer: 44, reach: 46, body: 18,
        tell: 0.56, tell2: 0.46, counterTell: 0.3, chiTell: 0.72, swing: 0.16, recover: 0.5, chiRecover: 0.95, hurt: 0.35,
        damage: 3, chiSpeed: 125, score: 10000 }),
]);

export const FLOORS = Object.freeze([
    Object.freeze({ n: 1, name: 'THE RED HALL', theme: 0, length: 1100, time: 70, gap: 1.05, maxFoes: 5, pair: 0.3, speed: 1.0,
        mix: [0.55, 0.13, 0.32, 0], throwers: 1, pots: 0, blades: 0, wind: false, boss: 0,
        hint: ['PUNCH CLOSE - KICK FAR', 'DUCK AND KICK THE ROLLERS'] }),
    Object.freeze({ n: 2, name: 'THE LANTERN HALL', theme: 1, length: 1150, time: 75, gap: 1.0, maxFoes: 5, pair: 0.4, speed: 1.04,
        mix: [0.56, 0.16, 0.24, 0], throwers: 1, pots: 4.6, blades: 0, wind: false, boss: 1,
        hint: ['WATCH THE RAFTERS', 'THE POTS HIDE SNAKES'] }),
    Object.freeze({ n: 3, name: 'THE MIRROR ROOM', theme: 2, length: 1150, time: 75, gap: 0.95, maxFoes: 6, pair: 0.45, speed: 1.08,
        mix: [0.42, 0.16, 0.24, 0.18], throwers: 1, pots: 0, blades: 0, wind: false, boss: 2,
        hint: ['STRIKE A GHOST', 'ONLY ONCE IT IS SOLID'] }),
    Object.freeze({ n: 4, name: 'THE BAMBOO ROOF', theme: 3, length: 1200, time: 80, gap: 0.95, maxFoes: 6, pair: 0.5, speed: 1.06,
        mix: [0.56, 0.16, 0.24, 0], throwers: 2, pots: 0, blades: 5.5, wind: true, boss: 3,
        hint: ['DUCK WHEN THE WIND BLOWS', 'A GLINT MEANS A BLADE'] }),
    Object.freeze({ n: 5, name: 'THE GOLDEN HALL', theme: 4, length: 950, time: 80, gap: 0.9, maxFoes: 6, pair: 0.5, speed: 1.1,
        mix: [0.44, 0.16, 0.26, 0.14], throwers: 2, pots: 7.5, blades: 0, wind: false, boss: 4,
        hint: ['HE BLOCKS AND COUNTERS', 'WAIT FOR HIS OPENING'] }),
]);

export const FloorCount = FLOORS.length;
