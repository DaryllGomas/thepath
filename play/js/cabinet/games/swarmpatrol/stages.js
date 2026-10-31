// THE NODE · world 1 · SWARM PATROL on the Cabinet Engine · THE STAGES (data only; the build-out of 2026-10-18).
//
// A coin buys eight stages. Each brings one new thing, and the dives get bolder as they go:
//   1 FIRST PATROL     drones, escorts, two bosses; gentle dives, one bolt a dive (stage 1 teaches)
//   2 TRACTOR BEAM     four bosses, and now they open beams: lose a ship to one, shoot its captor IN FLIGHT for a twin
//   3 CHALLENGE STAGE  forty fly through in five flights and never shoot; 100 a hit, PERFECT pays 10000
//   4 SPLITTERS        seed pods that burst into two falling mites when shot (in the ranks too: mind what's under)
//   5 IRON SHELLS      steel-plated beetles take two hits; the swarm enters in mirrored pairs, double loops
//   6 STINGERS         gold hornets glow in the ranks, then strike straight down at you; up to five attack at once
//   7 CHALLENGE STAGE  faster, with figure loops
//   8 THE HIVE QUEEN   a big multi-part boss: two armoured wings, then her eye (it opens and shuts); her guard dives
// Rows (top to bottom, y = RowY[row]): row 0 the bosses, 1-2 the middle ranks, 3-4 the drones. Trains: the swarm
// flies in as `trains` trains (pairs = two mirrored trains at once); each train uses the next of `entry` (EntryPath
// templates, round.js). speed / rate multiply the diveSpeed / diveRate knobs; attack = most aliens attacking at once;
// bolts = bolts a diver may drop; wingman adds to pairChance; beams = whether bosses use the tractor beam;
// stingers = the share of dives that are a stinger's strike.

export const AlienKind = Object.freeze({ Drone: 0, Escort: 1, Boss: 2, Splitter: 3, Mite: 4, Shell: 5, Stinger: 6, Turncoat: 7 });
export const StageKind = Object.freeze({ Swarm: 0, Challenge: 1, Queen: 2 });

const D = AlienKind.Drone, E = AlienKind.Escort, B = AlienKind.Boss, S = AlienKind.Splitter, A = AlienKind.Shell, K = AlienKind.Stinger;

// the score book (x2 for anything not sitting in the ranks; the turncoat and mites are always worth their number)
export const Points = Object.freeze({
    [D]: 50, [E]: 80, [B]: 150, [S]: 100, [AlienKind.Mite]: 100, [A]: 120, [K]: 100, [AlienKind.Turncoat]: 1000,
});
export const BossFlightPoints = 400;          // a boss shot out of the ranks (not 300)
export const ChallengeHit = 100;              // each alien hit in a challenge stage (and the same again in the tally)
export const FlightBonus = 500;               // a whole challenge flight of 8 shot down
export const PerfectBonus = 10000;            // all forty
export const NoMissBonus = 1000;              // a stage cleared without losing a ship (+500 a stage after the first)
export const RescueBonus = 1000;
export const QueenBonus = 20000;
export const WingBonus = 2000;
export const ExtraShipAt = [20000, 60000];    // two extra ships, at these scores

// a challenge stage: five flights of eight; a flight is two mirrored trains of four (pair) or one train of eight,
// on challenge path template `tpl` (round.js); kinds are only looks there (every one falls to a single shot)
export const STAGES = [
    {
        n: 1, kind: StageKind.Swarm, name: 'FIRST PATROL', hint: 'SHOOT THEM IN FLIGHT FOR DOUBLE POINTS',
        show: [[D, 'DRONE', '50'], [E, 'ESCORT', '80'], [B, 'BOSS  2 HITS', '150']],
        rows: [[B, 2], [E, 8], [D, 10], [D, 10]],
        trains: 4, pairs: false, entry: [0, 2, 1, 0], entrySpeed: 1,
        speed: 0.85, rate: 0.7, attack: 2, bolts: 1, wingman: 0, beams: false, stingers: 0, escortBoss: 0.35,
    },
    {
        n: 2, kind: StageKind.Swarm, name: 'TRACTOR BEAM', hint: 'SHOOT A CAPTOR IN FLIGHT FOR A TWIN SHIP',
        show: [[B, 'BOSS BEAM', 'TAKES A SHIP']],
        rows: [[B, 4], [E, 8], [E, 8], [D, 10], [D, 10]],
        trains: 5, pairs: false, entry: [1, 0, 2, 1, 0], entrySpeed: 1,
        speed: 0.92, rate: 0.8, attack: 3, bolts: 2, wingman: 0.05, beams: true, stingers: 0, escortBoss: 0.5,
    },
    {
        n: 3, kind: StageKind.Challenge, name: 'CHALLENGE STAGE', hint: 'THEY NEVER SHOOT. HIT ALL FORTY',
        show: [],
        flights: [
            { tpl: 0, pair: true, kinds: [D, D, D, D] },
            { tpl: 1, pair: true, kinds: [E, E, E, E] },
            { tpl: 2, pair: true, kinds: [D, E, D, E] },
            { tpl: 4, pair: true, kinds: [E, E, D, D] },
            { tpl: 0, pair: true, kinds: [B, E, E, E] },
        ],
        entrySpeed: 1.05, flightGap: 3.6,
    },
    {
        n: 4, kind: StageKind.Swarm, name: 'SPLITTERS', hint: 'A SPLITTER BURSTS INTO TWO FALLING MITES',
        show: [[S, 'SPLITTER', '100'], [AlienKind.Mite, 'MITE', '100']],
        rows: [[B, 4], [E, 8], [S, 8], [D, 10], [D, 10]],
        trains: 5, pairs: false, entry: [2, 1, 0, 2, 1], entrySpeed: 1.05,
        speed: 1.0, rate: 0.85, attack: 3, bolts: 2, wingman: 0.1, beams: true, stingers: 0, escortBoss: 0.6,
    },
    {
        n: 5, kind: StageKind.Swarm, name: 'IRON SHELLS', hint: 'SHELLS TAKE TWO HITS. THE FIRST CRACKS',
        show: [[A, 'IRON SHELL  2 HITS', '120']],
        rows: [[B, 4], [A, 8], [S, 8], [D, 10], [D, 10]],
        trains: 6, pairs: true, entry: [3, 3, 0, 0, 1, 1], entrySpeed: 1.1,
        speed: 1.02, rate: 0.9, attack: 4, bolts: 1, wingman: 0.15, beams: true, stingers: 0, escortBoss: 0.7,
    },
    {
        n: 6, kind: StageKind.Swarm, name: 'STINGERS', hint: 'A GLOWING STINGER STRIKES STRAIGHT DOWN',
        show: [[K, 'STINGER', '100']],
        rows: [[B, 4], [A, 8], [K, 8], [E, 10], [D, 10]],
        trains: 6, pairs: true, entry: [4, 4, 3, 3, 2, 2], entrySpeed: 1.15,
        speed: 1.12, rate: 1.05, attack: 5, bolts: 3, wingman: 0.2, beams: true, stingers: 0.3, escortBoss: 0.8,
    },
    {
        n: 7, kind: StageKind.Challenge, name: 'CHALLENGE STAGE', hint: 'FASTER NOW. THEY STILL NEVER SHOOT',
        show: [],
        flights: [
            { tpl: 3, pair: true, kinds: [K, K, K, K] },
            { tpl: 2, pair: true, kinds: [E, D, E, D] },
            { tpl: 1, pair: true, kinds: [K, E, K, E] },
            { tpl: 3, pair: true, kinds: [D, D, K, K] },
            { tpl: 4, pair: true, kinds: [B, K, K, K] },
        ],
        entrySpeed: 1.3, flightGap: 3.2,
    },
    {
        n: 8, kind: StageKind.Queen, name: 'THE HIVE QUEEN', hint: 'BREAK BOTH WINGS. THEN SHOOT HER EYE',
        show: [],
        rows: [[E, 0], [E, 0], [E, 0], [E, 8], [D, 10]],    // her guard (rows 3-4); she fills the top
        trains: 2, pairs: true, entry: [0, 0], entrySpeed: 1.1,
        speed: 1.08, rate: 0.8, attack: 3, bolts: 2, wingman: 0.1, beams: false, stingers: 0, escortBoss: 0,
    },
];

export const StageCount = STAGES.length;
