// THE NODE · world 1 · LAST HUMAN on the Cabinet Engine · THE SEVEN WAVES (data only).
//
// A coin buys the whole run: seven waves, the last one THE MAINFRAME. Each wave is a new mix and
// brings at least one new machine onto the floor:
//   1 FIRST CONTACT   DRONES only, slow: learn to aim, learn to rescue
//   2 THE HEAVIES     + CRUSHERS: can't be killed, shots shove them back, they step on humans
//   3 LIVE WIRES      + PYLONS: laid out before the warp, deadly to touch, they fry drones that walk in
//   4 MIND THIEVES    + CORTEXES: they walk to a human and turn it into a HUSK that hunts you
//   5 THE HATCHERY    + HATCHERS: they drift and hatch ROLLERS, whose shells bounce off the walls
//   6 THE SWARM       + MITES: streams of them pour in from the edges (the edge glows red first)
//   7 THE MAINFRAME   the boss: four gun pods, a core behind shutters, drones dropped from its belly
//
// Each wave: its name and two hint lines (the WAVE CARD), the machine shown big on that card, how many
// humans wander the floor, the pylons laid out (and their look), the drones' pace (x the droneSpeed
// knob), and its BURSTS. A burst warps in when the floor has thinned out (round.js: a quarter of the
// last burst left, or the burst has run long). Counts are x the waveScale knob (mercy thins them).
export const WAVES = Object.freeze([
    {
        name: 'FIRST CONTACT', hint: ['SHOOT THE MACHINES', 'TOUCH THE HUMANS TO SAVE THEM'],
        feature: 'drone', humans: 5, pylons: 0, pylonLook: 0, pace: 0.7,
        bursts: [{ drone: 16 }, { drone: 14 }],
    },
    {
        name: 'THE HEAVIES', hint: ['CRUSHERS NEVER DIE', 'SHOTS SHOVE THEM - MIND THE HUMANS'],
        feature: 'crusher', humans: 6, pylons: 0, pylonLook: 0, pace: 0.96,
        bursts: [{ drone: 20, crusher: 2 }, { drone: 18, crusher: 2 }, { drone: 16, crusher: 2 }],
    },
    {
        name: 'LIVE WIRES', hint: ['PYLONS KILL ON TOUCH', 'SHOOT THEM OR LURE DRONES IN'],
        feature: 'pylon', humans: 6, pylons: 16, pylonLook: 0, pace: 1.0,
        bursts: [{ drone: 22, crusher: 1 }, { drone: 20, crusher: 1 }, { drone: 18, crusher: 1 }],
    },
    {
        name: 'MIND THIEVES', hint: ['CORTEXES TURN HUMANS INTO HUSKS', 'REACH THE HUMANS FIRST'],
        feature: 'cortex', humans: 7, pylons: 8, pylonLook: 1, pace: 1.0,
        bursts: [{ drone: 14, cortex: 4, crusher: 1 }, { drone: 12, cortex: 4 }, { drone: 12, cortex: 3, crusher: 1 }],
    },
    {
        name: 'THE HATCHERY', hint: ['HATCHERS BREED ROLLERS', 'ROLLER SHELLS BOUNCE OFF THE WALLS'],
        feature: 'hatcher', humans: 6, pylons: 6, pylonLook: 2, pace: 1.04,
        bursts: [{ drone: 12, hatcher: 2 }, { drone: 10, hatcher: 3, crusher: 1 }, { drone: 10, hatcher: 2, cortex: 2 }],
    },
    {
        name: 'THE SWARM', hint: ['MITES POUR IN FROM THE EDGES', 'WATCH FOR THE RED GLOW'],
        feature: 'mite', humans: 6, pylons: 6, pylonLook: 0, pace: 1.06,
        bursts: [{ mite: 24, drone: 10 }, { mite: 24, drone: 8, crusher: 1, hatcher: 1 }, { mite: 32, drone: 8, cortex: 2 }],
    },
    {
        name: 'THE MAINFRAME', hint: ['SHOOT OFF THE GUN PODS', 'HIT THE CORE WHEN IT OPENS'],
        feature: 'mainframe', humans: 5, pylons: 6, pylonLook: 2, pace: 1.1, boss: true,
        bursts: [{ drone: 10, crusher: 1 }],
    },
]);

// what the WAVE CARD calls the featured machine
export const FeatureName = Object.freeze({
    drone: 'DRONE', crusher: 'CRUSHER', pylon: 'PYLON', cortex: 'CORTEX', hatcher: 'HATCHER', mite: 'MITE', mainframe: 'THE MAINFRAME',
});
