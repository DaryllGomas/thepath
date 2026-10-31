// THE NODE · world 1 · IRONWORKS (Ironclad Amusements, 1981) on the Cabinet Engine · THE FIVE BOARDS
// (data only; level.js builds a Board from each).
//
//   1 THE GIRDERS    the old board: sloped girders, drums, the oil drum and its fire-balls, two hammers.
//                    It teaches the game: slower drums, one fire-ball, the banner at the top.
//   2 THE CONVEYORS  flat belts that carry the climber and drive the ORE CARTS down the works; three of
//                    them REVERSE (the arrows blink first). The smelter spits SPARKS that climb ladders.
//   3 THE LIFTS      two cages ride up and down their shafts; welders' sparks patrol the ledges; the
//                    foreman lets SPRING JACKS go along the top, and they drop down the column by the hole.
//   4 THE RIVETS     no drums: eight BOLTS hold the old scaffold up. Walk into a bolt to pull it (the gap
//                    stays open: hop it). Sparks pour out of the oil drum and come up after you.
//   5 THE FURNACE    the finale: sloped girders again, hot drums that come out of the furnace as fire,
//                    and the foreman on his GANTRY. Pull its four bolts and he goes down with it. That
//                    is the win.
//
// girders: [x0, x1, yLeft, yRight, { row, roll, belt, lift }]   ladders: [x, lo, hi, broken]
// hammers: [girder, x]   pickups: [girder, x, kind]  (0 hard hat 300, 1 lunch pail 500, 2 toolbox 800)
// bolts: [left girder, right girder, x]   start: [girder, x, facing]
// tune (x the credit's knobs): drum/cart speed, gap between throws, fire-balls alive, a drum's ladder
// chance, fire-ball speed, the bonus the board starts at.

export const BOARDS = Object.freeze([
    {
        n: 1, name: 'THE GIRDERS', hint: 'HOP THE DRUMS  REACH THE BANNER', kind: 'girders',
        girders: [
            [8, 312, 222, 217],         // 0 drums roll left, into the oil drum
            [8, 280, 186, 192],         // 1 right
            [40, 312, 163, 157],        // 2 left
            [8, 280, 128, 134],         // 3 right
            [40, 312, 105, 99],         // 4 left
            [8, 280, 70, 76],           // 5 right: the foreman throws from its left end
            [120, 216, 46, 46],         // 6 the top platform: the banner
        ],
        goal: 6,
        ladders: [
            [252, 0, 1], [132, 0, 1, 1],
            [52, 1, 2], [148, 1, 2, 1],
            [156, 2, 3], [260, 2, 3], [92, 2, 3, 1],
            [60, 3, 4], [196, 3, 4, 1],
            [252, 4, 5], [116, 4, 5, 1],
            [204, 5, 6],
        ],
        hammers: [[1, 108], [4, 180]],
        pickups: [[2, 212, 0], [4, 84, 1], [5, 168, 2]],
        start: [0, 72, 1],
        oil: { g: 0, x: 24, w: 16, h: 18, intake: 46, dir: -1, drop: 32, lit: false },
        foreman: { kind: 'drums', g: 5, x: 20, stack: 8, throwX: 52 },
        banner: { x: 124, w: 72 },
        tune: { speed: 0.92, gap: 1.2, fireMax: 1, ladder: 0.2, fire: 0.95, bonus: 5000, climb: 0 },
    },
    {
        n: 2, name: 'THE CONVEYORS', hint: 'THE BELTS CARRY YOU  WATCH THE ARROWS', kind: 'conveyors',
        girders: [
            [8, 312, 222, 222, { belt: 0 }],      // 0 always runs left, into the smelter
            [8, 312, 186, 186, { belt: 1 }],      // 1 reverses
            [8, 312, 150, 150, { belt: 2 }],      // 2 reverses
            [8, 312, 114, 114, { belt: 3 }],      // 3 reverses
            [8, 296, 78, 78, { belt: 4 }],        // 4 always runs right: the foreman tips the carts on here
            [120, 216, 46, 46],                   // 5 the top platform
        ],
        goal: 5,
        belts: [{ dir: -1 }, { dir: 1, flip: 9, at: 5 }, { dir: -1, flip: 9, at: 8 }, { dir: 1, flip: 9, at: 2 }, { dir: 1 }],
        ladders: [
            [280, 0, 1], [136, 0, 1, 1],
            [40, 1, 2], [188, 1, 2],
            [268, 2, 3], [112, 2, 3, 1],
            [72, 3, 4], [240, 3, 4],
            [204, 4, 5],
        ],
        hammers: [[1, 104], [3, 176]],
        pickups: [[1, 232, 0], [2, 84, 1], [4, 136, 2]],
        start: [0, 168, 1],
        oil: { g: 0, x: 24, w: 16, h: 18, intake: 46, dir: -1, lit: true },
        foreman: { kind: 'carts', g: 4, x: 20, stack: 8, throwX: 52 },
        banner: { x: 124, w: 72 },
        tune: { speed: 1.15, gap: 1.1, fireMax: 2, ladder: 0, fire: 1.0, bonus: 6000, climb: 0.4 },
    },
    {
        n: 3, name: 'THE LIFTS', hint: 'RIDE THE CAGES  MIND THE SPRINGS', kind: 'lifts',
        girders: [
            [8, 94, 222, 222, { row: 0 }],        // 0 the floor, left of the pit
            [118, 312, 222, 222, { row: 0 }],     // 1 the floor, right of it
            [94, 118, 222, 222, { row: 0, lift: 0 }],   // 2 cage A: the floor <-> the middle ledge
            [118, 182, 150, 150, { row: 1 }],     // 3 the middle ledge
            [182, 206, 150, 150, { row: 1, lift: 1 }],  // 4 cage B: the middle ledge <-> the high ledge
            [206, 312, 112, 112, { row: 2 }],     // 5 the high ledge (the spring column crosses it)
            [248, 312, 76, 76, { row: 3 }],       // 6 the top, right of the hole
            [8, 236, 76, 76, { row: 3 }],         // 7 the top: the foreman and his springs
            [120, 232, 46, 46, { row: 4 }],       // 8 the top platform
        ],
        goal: 8,
        lifts: [{ g: 2, low: 222, high: 150, at: 0 }, { g: 4, low: 150, high: 112, at: 1.2 }],
        ladders: [[288, 5, 6], [226, 7, 8], [160, 1, 3, 1], [52, 0, 7, 1]],
        hammers: [[3, 140]],
        pickups: [[1, 276, 0], [5, 240, 1], [6, 302, 2]],
        start: [0, 40, 1],
        springs: { g: 7, fromX: 52, dropX: 236, colX: 242 },
        patrols: [[3, 168, -1]],
        foreman: { kind: 'springs', g: 7, x: 20, stack: 8, throwX: 52 },
        banner: { x: 124, w: 72 },
        tune: { speed: 1.0, gap: 1.0, fireMax: 2, ladder: 0, fire: 0.8, bonus: 5000, climb: 0 },
    },
    {
        n: 4, name: 'THE RIVETS', hint: 'PULL ALL EIGHT BOLTS  HOP THE GAPS', kind: 'rivets',
        girders: [
            [8, 312, 222, 222, { row: 0 }],       // 0 the floor
            [8, 68, 186, 186, { row: 1 }], [76, 244, 186, 186, { row: 1 }], [252, 312, 186, 186, { row: 1 }],     // 1 2 3
            [8, 68, 150, 150, { row: 2 }], [76, 244, 150, 150, { row: 2 }], [252, 312, 150, 150, { row: 2 }],     // 4 5 6
            [8, 68, 114, 114, { row: 3 }], [76, 244, 114, 114, { row: 3 }], [252, 312, 114, 114, { row: 3 }],     // 7 8 9
            [8, 68, 78, 78, { row: 4 }], [76, 244, 78, 78, { row: 4 }], [252, 312, 78, 78, { row: 4 }],           // 10 11 12
        ],
        goal: -1,
        bolts: [[1, 2, 72], [2, 3, 248], [4, 5, 72], [5, 6, 248], [7, 8, 72], [8, 9, 248], [10, 11, 72], [11, 12, 248]],
        ladders: [
            [24, 0, 1], [296, 0, 3], [120, 0, 2, 1],
            [104, 2, 5], [216, 2, 5],
            [24, 4, 7], [296, 6, 9], [160, 5, 8], [200, 5, 8, 1],
            [104, 8, 11], [216, 8, 11],
        ],
        hammers: [[2, 160], [8, 128]],
        pickups: [[4, 40, 0], [9, 284, 1], [11, 228, 2]],
        start: [0, 64, 1],
        oil: { g: 0, x: 152, w: 16, h: 18, dir: 0, lit: true },
        foreman: { kind: 'stand', x: 148, deck: 54, x0: 124, x1: 196 },
        tune: { speed: 1.0, gap: 1.0, fireMax: 5, ladder: 0, fire: 1.05, bonus: 7000, climb: 0.6 },
    },
    {
        n: 5, name: 'THE FURNACE', hint: 'PULL THE GANTRY BOLTS  BRING HIM DOWN', kind: 'furnace',
        girders: [
            [8, 312, 217, 222],                  // 0 drums roll right, into the furnace
            [40, 312, 192, 186],                 // 1 left
            [8, 280, 157, 163],                  // 2 right
            [40, 312, 134, 128],                 // 3 left
            [8, 280, 99, 105],                   // 4 right
            [40, 96, 76, 76, { row: 5, roll: -1 }],    // 5 the top, left of the gantry
            [104, 132, 76, 76, { row: 5 }],            // 6 under the gantry
            [140, 180, 76, 76, { row: 5 }],            // 7
            [188, 216, 76, 76, { row: 5 }],            // 8
            [224, 280, 76, 76, { row: 5, roll: 1 }],   // 9 the top, right of it
        ],
        goal: -1,
        bolts: [[5, 6, 100], [6, 7, 136], [7, 8, 184], [8, 9, 220]],
        ladders: [
            [68, 0, 1], [188, 0, 1, 1],
            [268, 1, 2], [172, 1, 2, 1],
            [164, 2, 3], [60, 2, 3], [228, 2, 3, 1],
            [260, 3, 4], [124, 3, 4, 1],
            [68, 4, 5], [252, 4, 9],
        ],
        hammers: [[1, 212], [4, 140]],
        pickups: [[2, 104, 0], [3, 236, 1], [1, 120, 2]],
        start: [0, 40, 1],
        oil: { g: 0, x: 282, w: 24, h: 22, intake: 270, dir: 1, lit: true, furnace: true },
        foreman: { kind: 'gantry', x: 148, deck: 50, x0: 104, x1: 216, dropL: 104, dropR: 216 },
        tune: { speed: 1.12, gap: 0.95, fireMax: 3, ladder: 0.25, fire: 1.05, bonus: 8000, climb: 0.4, hot: 3 },
    },
]);
