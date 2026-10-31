// THE NODE · world 1 · LANCE RIDER · THE SEVEN WAVES (data only).
//
// Each wave: its card (name + the hint under it), its stone, where riders ride in, the make-up of the
// wave and its twist. Coordinates are the round's: X = world px 0..304 (wraps), Y = screen px (down),
// a ledge's `top` is where feet stand; every ledge is 6 px of stone, the base stands in the lava.
//
//   base       [x0, x1]                    the brick base at y 200 (null: no base, all pit)
//   ledges     [x0, x1, top, crumbleAt]    crumbleAt = seconds into the wave it falls (0 = solid stone);
//                                          a ledge across the seam is two rows with the same top
//   pads       [x, feet y]                 where a rider rides in (a pad on fallen stone is skipped)
//   start      [x, feet y]                 the player's ledge at the card; respawn: the choices after a fall
//   riders     tiers in the order they ride in (0 bounder, 1 hunter, 2 shadow lord); pairs = [[t, t] ...]
//   eggs       [x, ledge top] laid at the card (THE CLUTCH)
//   speed / react / chase                  x the rivals' air speed / decision interval / chance to hunt you
//   hand       the lava hand reaches for skimmers      hawkAt   seconds before the cinder hawk comes
//   bonus      the wave's own bonus: survival | clutch | stone | pairs | beast
export const STAGES = Object.freeze([
    {
        name: 'THE LISTS', hint: 'THE HIGHER LANCE WINS', hint2: 'TAKE THE EGGS',
        base: [80, 224],
        ledges: [[112, 192, 72], [264, 304, 92], [0, 40, 92], [20, 92, 134], [196, 268, 124], [284, 304, 176], [0, 20, 176]],
        pads: [[112, 200], [192, 200], [152, 72], [56, 134], [232, 124]],
        start: [152, 200], respawn: [[152, 200], [104, 200], [200, 200]],
        riders: [0, 0, 0, 0],
        startRivals: 2, maxActive: 2, spawnGap: 3.5,
        speed: 0.86, react: 1.25, chase: 0.75,
        hand: false, hawkAt: 90, bonus: null,
    },
    {
        name: 'THE CLUTCH', hint: 'TAKE EVERY EGG', hint2: 'BEFORE THEY HATCH',
        base: [80, 224],
        ledges: [[128, 176, 66], [16, 76, 100], [228, 288, 100], [92, 140, 148], [164, 212, 148], [286, 304, 172], [0, 18, 172]],
        pads: [[152, 66], [46, 100], [258, 100], [116, 148], [188, 148], [112, 200], [192, 200]],
        start: [152, 200], respawn: [[152, 200], [104, 200], [200, 200]],
        eggs: [[30, 100], [62, 100], [242, 100], [274, 100], [104, 148], [200, 148]],
        riders: [0, 0, 0],
        startRivals: 1, maxActive: 2, spawnGap: 6,
        speed: 0.9, react: 1.15, chase: 0.8,
        hand: false, hawkAt: 80, bonus: 'clutch',
    },
    {
        name: 'THE PIT HAND', hint: 'DO NOT SKIM THE LAVA', hint2: 'LOSE NO RIDER',
        base: [96, 208],
        ledges: [[40, 104, 78], [200, 264, 78], [116, 188, 128], [276, 304, 160], [0, 36, 160]],
        pads: [[72, 78], [232, 78], [152, 128], [120, 200], [184, 200]],
        start: [152, 200], respawn: [[152, 200], [116, 200], [188, 200]],
        riders: [0, 0, 1, 0, 1, 0],
        startRivals: 2, maxActive: 3, spawnGap: 4,
        speed: 0.95, react: 1.05, chase: 0.85,
        hand: true, hawkAt: 70, bonus: 'survival',
    },
    {
        name: 'FALLING STONE', hint: 'THE LEDGES GIVE WAY', hint2: 'BE QUICK',
        base: [80, 224],
        ledges: [[104, 200, 68, 38], [12, 64, 106, 16], [240, 292, 106], [30, 90, 152], [214, 274, 146, 27], [288, 304, 180, 48], [0, 16, 180, 48]],
        pads: [[152, 68], [38, 106], [266, 106], [60, 152], [244, 146], [112, 200], [192, 200]],
        start: [152, 200], respawn: [[152, 200], [104, 200], [200, 200]],
        riders: [1, 0, 1, 0, 1, 0],
        startRivals: 2, maxActive: 3, spawnGap: 4,
        speed: 1.0, react: 1.0, chase: 0.9,
        hand: true, hawkAt: 60, bonus: 'stone',
    },
    {
        name: 'GLADIATORS', hint: 'THEY RIDE IN PAIRS', hint2: 'UNHORSE BOTH',
        base: [80, 224],
        ledges: [[24, 88, 80], [216, 280, 80], [128, 176, 116], [8, 60, 158], [244, 296, 158]],
        pads: [[56, 80], [248, 80], [152, 116], [34, 158], [270, 158], [112, 200], [192, 200]],
        start: [152, 200], respawn: [[152, 200], [104, 200], [200, 200]],
        pairs: [[0, 0], [1, 1], [1, 1]],
        startRivals: 2, maxActive: 4, spawnGap: 4,
        speed: 1.0, react: 0.95, chase: 0.9,
        hand: true, hawkAt: 50, bonus: 'pairs',
    },
    {
        name: 'THE SHADOW HOST', hint: 'THE LORDS RIDE HIGH', hint2: 'THE HAWK HUNTS THE SLOW',
        base: [104, 200],
        ledges: [[128, 176, 62], [24, 80, 108], [224, 280, 108], [272, 304, 166], [0, 32, 166]],
        pads: [[152, 62], [52, 108], [252, 108], [128, 200], [176, 200]],
        start: [152, 200], respawn: [[152, 200], [128, 200], [176, 200]],
        riders: [2, 1, 0, 2, 1, 2, 0],
        startRivals: 2, maxActive: 3, spawnGap: 4,
        speed: 1.0, react: 0.95, chase: 0.95,
        hand: true, hawkAt: 22, bonus: 'survival',
    },
    {
        name: 'THE PIT BEAST', hint: 'STRIKE ITS CROWN', hint2: 'FROM ABOVE', boss: true,
        base: null,
        ledges: [[8, 72, 176], [232, 296, 176], [24, 84, 96], [220, 280, 96], [124, 180, 58]],
        pads: [[40, 176], [264, 176], [54, 96], [250, 96], [152, 58]],
        start: [152, 58], respawn: [[152, 58], [54, 96], [250, 96]],
        riders: [0, 0],
        adds: [[4, [1]], [2, [1, 0]]],          // [beast hp at or under, the riders it calls]
        spots: [152, 112, 192],                 // where it rises out of the pit
        startRivals: 1, maxActive: 2, spawnGap: 5,
        speed: 0.95, react: 1.0, chase: 0.85,
        hand: false, hawkAt: 0, bonus: 'beast',
    },
]);
