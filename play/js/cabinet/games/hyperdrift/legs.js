// THE NODE · world 1 · HYPER DRIFT (Redline Coin-Op, 1983) on the Cabinet Engine · THE RALLY: five legs, in ROM.
//
// A 1983 board had its roads in ROM, so every leg is FIXED (the player learns it); only the traffic and the
// hazards (oil, puddles, ice, rockfalls, the kerbside taxis) are dealt per game. A leg is data:
//   nodes      (s, centre x) pairs, eased with a half-cosine between each pair (track.js builds the tables)
//   hairpins   the node pairs of each steep piece (a Z the camera can follow: ~160 px across in 90 px of s)
//   works / bridges / tunnels / fork / gaps   s ranges (gaps: the canyon's crevasses, a ramp before each)
//   slicks     s ranges where the hazard of the leg is dealt (oil, puddles or ice, by the leg's `slick` kind)
//   rocks      s ranges where rocks fall (the canyon)
//   taxis      s ranges where taxis wait at the kerb to pull out (the city)
//   pads       [s, lane] boost pads (lane +1 yours, -1 the far one)
//   extend     the EXTENDED TIME gate (mid-leg);  checkpoint  the end of the leg (the last leg's is the GOAL)
//   dash       the last leg only: from the extend gate on, no traffic, the RIVAL races you to the flag
//   clock / extendTime   seconds on the clock at the start and added at the gate (x the `clock` knob)
//   grip       the road's grip (rain makes the coast slick)
//   traffic    { same, onc, trucks }: spawn rate your way and oncoming (x the `traffic` knob), truck share
// Each leg brings something new; the card tells the player what (`news`) and how (`hint`).

export const Terrain = Object.freeze({ Desert: 0, City: 1, Coast: 2, Snow: 3, Canyon: 4 });
export const Slick = Object.freeze({ Oil: 0, Puddle: 1, Ice: 2 });

export const LEGS = Object.freeze([
    {
        name: 'DESERT RUN', terrain: Terrain.Desert, slick: Slick.Oil,
        news: 'TRUCKS - OIL - ROAD WORKS', hint: 'HOLD A TO DRIFT THE HAIRPINS',
        nodes: [
            0, 160, 520, 160,
            880, 118, 1260, 202, 1640, 112, 2020, 196,      // the S-curves (oil lies here)
            2200, 196, 2800, 196,                           // ROAD WORKS 2240-2760 (your lane shut)
            2960, 236, 3050, 76, 3200, 76,                  // HAIRPIN 1 (jumps left)
            3520, 150, 3820, 96, 4020, 132,
            4080, 132, 4460, 132,                           // THE BRIDGE 4120-4420
            4760, 200, 5020, 150,                           // EXTEND 4600
            5140, 104, 6100, 104,                           // THE FORK 5160-6040 (branch to the right)
            6320, 168, 6440, 238, 6530, 80, 6640, 74,       // HAIRPIN 2 (left)
            6730, 236, 6860, 244,                           // HAIRPIN 3 (right): the double Z
            7160, 170, 7400, 200,
            7540, 226, 7630, 70, 7760, 72,                  // HAIRPIN 4 (left)
            8100, 160, 9400, 160,                           // the run to the checkpoint
        ],
        hairpins: [2960, 3050, 6440, 6530, 6640, 6730, 7540, 7630],
        works: [2240, 2760], bridges: [4120, 4420], tunnels: [], gaps: [],
        fork: { s0: 5160, s1: 6040, nodes: [5160, 0, 5400, 132, 5560, 132, 5700, 150, 5840, 132, 6040, 0] },
        slicks: [1000, 2000, 3300, 3900, 4700, 5100, 6900, 7400],
        rocks: [], taxis: [], pads: [],
        extend: 4600, checkpoint: 8300, dash: 0,
        clock: 54, extendTime: 26, grip: 1,
        traffic: { same: 1, onc: 1, trucks: 0.55 },
    },
    {
        name: 'NIGHT CITY', terrain: Terrain.City, slick: Slick.Oil,
        news: 'TUNNELS - TAXIS PULL OUT - BOOST PADS', hint: 'YOUR HEADLIGHTS SHOW THE WAY',
        nodes: [
            0, 160, 700, 160,
            860, 100, 1300, 100,                            // a jog left (full speed, just)
            1460, 190, 2500, 190,                           // a jog right; TUNNEL A 1580-2380
            2640, 232, 2730, 76, 2880, 76,                  // HAIRPIN 1 (left): a city corner
            3180, 140, 4100, 140,                           // the boulevard: taxis at the kerb; EXTEND 4000
            4260, 200, 4900, 200,                           // ROAD WORKS 4330-4810
            5050, 130, 5450, 190, 5850, 120, 6000, 120,     // TUNNEL B 5020-5960 (it bends)
            6150, 84, 6240, 244, 6390, 246,                 // HAIRPIN 2 (right)
            6700, 170, 7600, 170,                           // the avenue: more taxis
            7800, 110, 8100, 160, 9400, 160,
        ],
        hairpins: [2640, 2730, 6150, 6240],
        works: [4330, 4810], bridges: [], tunnels: [1580, 2380, 5020, 5960], gaps: [],
        fork: null,
        slicks: [800, 1400, 3200, 3900, 7000, 7700],
        rocks: [], taxis: [3250, 3950, 6760, 7560],
        pads: [[560, 1], [3420, 1], [5300, 1], [7160, 1]],
        extend: 4000, checkpoint: 8300, dash: 0,
        clock: 54, extendTime: 26, grip: 1,
        traffic: { same: 1.15, onc: 1.1, trucks: 0.35 },
    },
    {
        name: 'THE COAST', terrain: Terrain.Coast, slick: Slick.Puddle,
        news: 'RAIN - PUDDLES - THREE BRIDGES', hint: 'THE ROAD IS SLICK: BRAKE EARLY',
        nodes: [
            0, 160, 500, 160,
            800, 124, 1200, 196, 1600, 136,                 // the shore road (puddles)
            1700, 136, 2200, 136,                           // BRIDGE A 1760-2140
            2450, 200, 2650, 200,
            2810, 236, 2900, 76, 3050, 76,                  // HAIRPIN 1 (left)
            3350, 140, 3800, 100,
            3900, 100, 4500, 100,                           // BRIDGE B 3960-4440: the long one
            4800, 170, 5000, 170,                           // EXTEND 4900
            5300, 110, 5600, 190, 5900, 124, 6050, 124,
            6200, 84, 6290, 244, 6440, 246,                 // HAIRPIN 2 (right)
            6640, 200, 7200, 200,                           // BRIDGE C 6700-7120
            7560, 226, 7650, 70, 7800, 72,                  // HAIRPIN 3 (left)
            8150, 160, 9600, 160,
        ],
        hairpins: [2810, 2900, 6200, 6290, 7560, 7650],
        works: [], bridges: [1760, 2140, 3960, 4440, 6700, 7120], tunnels: [], gaps: [],
        fork: null,
        slicks: [650, 1650, 2300, 2700, 3150, 3850, 5100, 5950, 7250, 7500],
        rocks: [], taxis: [],
        pads: [[1300, 1], [5450, 1], [7330, 1]],
        extend: 4900, checkpoint: 8500, dash: 0,
        clock: 56, extendTime: 27, grip: 0.84,
        traffic: { same: 0.95, onc: 1, trucks: 0.5 },
    },
    {
        name: 'SNOW PASS', terrain: Terrain.Snow, slick: Slick.Ice,
        news: 'ICE - SNOWBANKS - SIX HAIRPINS', hint: 'ON ICE THE WHEEL DOES NOTHING',
        nodes: [
            0, 160, 500, 160,
            720, 120, 1000, 190,                            // (ice)
            1160, 236, 1250, 76, 1400, 76,                  // HAIRPIN 1 (left)
            1700, 140, 1900, 140,
            2060, 84, 2150, 244, 2300, 246,                 // HAIRPIN 2 (right)
            2600, 180, 2900, 180,                           // (ice)
            3060, 236, 3150, 76, 3300, 76,                  // HAIRPIN 3 (left)
            3700, 150, 4300, 150,                           // the col: EXTEND 4000
            4550, 100, 4850, 190, 5000, 190,                // (ice)
            5160, 236, 5250, 76, 5400, 76,                  // HAIRPIN 4 (left)
            5700, 140, 5900, 140,
            6060, 84, 6150, 244, 6300, 246,                 // HAIRPIN 5 (right)
            6600, 160, 6900, 160,                           // (ice)
            7060, 236, 7150, 76, 7300, 76,                  // HAIRPIN 6 (left)
            7700, 160, 9200, 160,
        ],
        hairpins: [1160, 1250, 2060, 2150, 3060, 3150, 5160, 5250, 6060, 6150, 7060, 7150],
        works: [], bridges: [], tunnels: [], gaps: [],
        fork: null,
        slicks: [560, 1050, 2420, 2960, 4420, 4980, 6460, 6960],
        rocks: [], taxis: [],
        pads: [[3820, 1], [5560, 1]],
        extend: 4000, checkpoint: 7900, dash: 0,
        clock: 56, extendTime: 27, grip: 0.94,
        traffic: { same: 0.7, onc: 0.75, trucks: 0.45 },
    },
    {
        name: 'CANYON FINAL', terrain: Terrain.Canyon, slick: Slick.Oil,
        news: 'ROCKFALLS - JUMPS - THE RIVAL', hint: 'BEAT THE RIVAL TO THE FLAG',
        nodes: [
            0, 160, 500, 160,
            800, 110, 1200, 200, 1600, 120,                 // the canyon floor (rocks fall here)
            1750, 120, 2400, 120,                           // JUMP 1: the lip at 2080
            2600, 190, 2700, 190,
            2860, 236, 2950, 76, 3100, 76,                  // HAIRPIN 1 (left)
            3400, 150, 3800, 104, 4200, 186,                // (rocks)
            4350, 186, 4900, 186,                           // THE DASH 4600: the rival pulls out
            5200, 120, 5550, 200,                           // (rocks)
            5700, 236, 5790, 76, 5940, 76,                  // HAIRPIN 2 (left)
            6250, 150, 6550, 200,
            6700, 200, 7300, 200,                           // JUMP 2: the lip at 7000
            7480, 226, 7570, 70, 7700, 72,                  // HAIRPIN 3 (left)
            8050, 160, 9600, 160,                           // the run to the flag
        ],
        hairpins: [2860, 2950, 5700, 5790, 7480, 7570],
        works: [], bridges: [], tunnels: [], gaps: [2080, 7000],
        fork: null,
        slicks: [],
        rocks: [700, 1700, 3300, 4250, 5050, 5650, 6000, 6650, 7800, 8250],
        taxis: [],
        pads: [[1000, 1], [4450, 1], [6400, -1], [7880, 1]],
        extend: 4600, checkpoint: 8400, dash: 4600,
        clock: 56, extendTime: 32, grip: 1,
        traffic: { same: 0.85, onc: 0.9, trucks: 0.5 },
    },
]);

// the crevasse: the ramp runs up to the lip; the gap is this long; the jump needs this speed (px/s)
export const GapLength = 56, RampLength = 26, JumpSpeed = 112;
