// THE NODE · world 1 · MUD & METAL (Redline Coin-Op, 1984) · THE CHAMPIONSHIP: six tracks, each a race.
//
// Stages 1-5 are QUALIFIERS: cross the line under the track's PAR (x the parTime mercy knob) or lose a
// try and ride it again. Stage 6 is THE CHAMPIONSHIP: no par, the whole field on the grid with you, and
// you must finish in the TOP 3. Each track brings one new thing:
//   1 DUSK QUALIFIER  the lesson: ramps, a table, a double, a little mud, slow riders to pass
//   2 BOG ROAD        rain; mud bogs across three lanes (find the dry one) and FORDS that cool the engine
//   3 CANYON CREEK    CREEK GAPS: come up short and you SPLASH; step-ups that want speed
//   4 MIDNIGHT        night under the floodlights; HAY BALES in the lanes, some where a jump comes down
//   5 STADIUM CROSS   indoors, two laps; a PACK starts with you and the pushy ones lean on you
//   6 THE CHAMPIONSHIP the field of seven, everything at once; top 3 takes the cup
// A track's RECORD is the time that pays the TRACK RECORD bonus (it is never eased).
// Distances are track space (track.js): the lane-0 x of a feature's foot; riders' speeds are x top speed.
import { Track, RiderKind } from './track.js';

export const Theme = Object.freeze({ Dusk: 0, Bog: 1, Canyon: 2, Night: 3, Stadium: 4, Final: 5 });

// jerseys (sprites.js Rival[j]): 0 blue, 1 orange, 2 green, 3 white
function stage1() {
    const t = new Track(5800);
    t.rider(0, 0, 0.74).rider(0, 3, 0.70);          // at the gate beside you: the first two passes
    t.whoops(520, 2);
    t.ramp(820);
    t.mudhole(1, 1100, 1240).mudhole(2, 1140, 1280);
    t.rider(1200, 1, 0.66);
    t.kicker(1500);
    t.table(1880, 150);
    t.rider(2150, 2, 0.68, true);
    t.mudhole(0, 2380, 2520).mudhole(3, 2420, 2580);
    t.double(2760);
    t.rider(3060, 0, 0.64).rider(3120, 3, 0.70);
    t.ramp(3320);
    t.gap(3760, 84);
    t.mudhole(1, 4140, 4290).mudhole(2, 4180, 4320);
    t.kicker(4480);
    t.rider(4640, 1, 0.66, true);
    t.table(4920, 120);
    t.whoops(5380, 2);
    return t.bake();
}

function stage2() {
    const t = new Track(6400);
    t.rider(0, 0, 0.72).rider(0, 3, 0.68);
    t.ramp(480);
    t.bog([0, 1, 2], 800, 1010);                    // the dry lane: 3 (and a rider in it)
    t.rider(860, 3, 0.64);
    t.ford(1220, 1380);
    t.kicker(1560);
    t.bog([1, 2, 3], 1880, 2090);                   // dry: 0
    t.whoops(2230, 3);
    t.table(2500, 140);
    t.ford(2900, 3060);
    t.rider(2960, 1, 0.68, true);
    t.double(3220);
    t.bog([0, 1, 3], 3560, 3780);                   // dry: 2
    t.rider(3600, 2, 0.62);
    t.ramp(3960);
    t.ford(4300, 4520);
    t.kicker(4660);
    t.rider(4720, 2, 0.66).rider(4780, 0, 0.70, true);
    t.bog([2, 3], 5000, 5200);
    t.gap(5300, 84);
    t.ford(5700, 5850);
    t.bigAir(5960);
    return t.bake();
}

function stage3() {
    const t = new Track(6800);
    t.rider(0, 0, 0.72).rider(0, 3, 0.70);
    t.kicker(480);
    t.sign(820, 'CREEK').creek(900, 60);
    t.table(1360, 160);
    t.mudhole(0, 1720, 1860).mudhole(3, 1740, 1880);
    t.stepUp(1960);
    t.rider(2300, 1, 0.68);
    t.sign(2520, 'CREEK').creek(2600, 80);
    t.whoops(3020, 3);
    t.triple(3300);
    t.rider(3560, 2, 0.66, true);
    t.sign(3800, 'BIG GAP').creek(3880, 100);
    t.ramp(4380);
    t.mudhole(1, 4620, 4780).mudhole(2, 4660, 4800);
    t.stepUp(4900);
    t.rider(5250, 0, 0.64).rider(5300, 3, 0.70);
    t.sign(5420, 'CREEK').creek(5500, 80);
    t.double(5900);
    t.bigAir(6300);
    return t.bake();
}

function stage4() {
    const t = new Track(7000);
    t.rider(0, 0, 0.72).rider(0, 3, 0.70);
    t.ramp(480);
    t.bale(1, 820).bale(2, 1060);
    t.kicker(1240);
    t.bale(0, 1480).bale(3, 1480);                 // where the kicker comes down: pick a middle lane before you leave
    t.table(1700, 140);
    t.rider(1900, 2, 0.66);
    t.bale(1, 2120).bale(2, 2160);
    t.mudhole(0, 2240, 2400).mudhole(3, 2260, 2420);
    t.double(2560);
    t.bale(2, 2900).bale(3, 2920);
    t.ford(3040, 3180);
    t.rider(3120, 1, 0.68, true);
    t.ramp(3360);
    t.bale(0, 3640).bale(1, 3660);
    t.gap(3800, 84);
    t.bale(3, 4200).bale(2, 4380).bale(0, 4380);
    t.whoops(4520, 3);
    t.rider(4600, 0, 0.64).rider(4650, 3, 0.70);
    t.kicker(4900);
    t.bale(1, 5140).bale(2, 5140);
    t.table(5320, 160);
    t.bale(3, 5760).bale(0, 5800);
    t.mudhole(1, 5900, 6040).mudhole(2, 5940, 6080);
    t.bigAir(6180);
    t.bale(1, 6560);
    return t.bake();
}

// the stadium: one lap's layout, laid twice
function stadiumLap(t, o) {
    t.whoops(o + 260, 4);
    t.triple(o + 520);
    t.table(o + 840, 110);
    t.mudhole(0, o + 1110, 1240 + o).mudhole(1, o + 1130, 1260 + o);
    t.double(o + 1300);
    t.whoops(o + 1600, 3);
    t.stepUp(o + 1820);
    t.kicker(o + 2240);
    t.mudhole(2, o + 2480, 2620 + o).mudhole(3, o + 2500, 2640 + o);
    t.triple(o + 2700);
    t.ramp(o + 3020);
}

function stage5() {
    const t = new Track(6800);
    stadiumLap(t, 0);
    t.lapAt = 3400;
    stadiumLap(t, 3400);
    // the pack: five on the gate with you, two of them pushy
    t.racer(0, 0, 0.82, RiderKind.Pack, 1, true);
    t.racer(0, 2, 0.76, RiderKind.Pack, 2);
    t.racer(0, 3, 0.86, RiderKind.Pack, 3, true);
    t.racer(-36, 1, 0.80, RiderKind.Pack, 0);
    t.racer(-36, 3, 0.74, RiderKind.Pack, 2);
    return t.bake();
}

function stage6() {
    const t = new Track(7600);
    t.ramp(500);
    t.whoops(860, 3);
    t.bog([0, 1], 1120, 1300);
    t.kicker(1380);
    t.ford(1700, 1840);
    t.table(1980, 150);
    t.sign(2340, 'CREEK').creek(2420, 70);
    t.triple(2860);
    t.bog([2, 3], 3160, 3340);
    t.double(3420);
    t.stepUp(3760);
    t.ford(4140, 4300);
    t.whoops(4400, 4);
    t.sign(4660, 'CREEK').creek(4740, 80);
    t.table(5200, 120);
    t.bog([0, 3], 5520, 5700);
    t.bigAir(5760);
    t.kicker(6160);
    t.whoops(6460, 3);
    t.ramp(6820);
    // the championship field: seven on the grid (you start in lane 1 of the front row)
    t.racer(0, 0, 0.88, RiderKind.Field, 1, true);
    t.racer(0, 2, 0.95, RiderKind.Field, 3);
    t.racer(0, 3, 0.92, RiderKind.Field, 0);
    t.racer(-36, 0, 0.86, RiderKind.Field, 2);
    t.racer(-36, 1, 0.98, RiderKind.Field, 0, true);
    t.racer(-36, 2, 0.84, RiderKind.Field, 2);
    t.racer(-36, 3, 0.90, RiderKind.Field, 1);
    return t.bake();
}

export const Stages = [
    { n: 1, name: 'DUSK QUALIFIER', hint: 'LEAN BACK IN THE AIR. LAND IT LEVEL.', theme: Theme.Dusk, par: 46, record: 37, track: stage1() },
    { n: 2, name: 'BOG ROAD', hint: 'FIND THE DRY LANE. WATER COOLS THE ENGINE.', theme: Theme.Bog, par: 50, record: 41, track: stage2() },
    { n: 3, name: 'CANYON CREEK', hint: 'HIT THE CREEK GAPS FAST OR SWIM.', theme: Theme.Canyon, par: 50, record: 41, track: stage3() },
    { n: 4, name: 'MIDNIGHT', hint: 'HAY BALES IN THE DARK. PICK YOUR LANE EARLY.', theme: Theme.Night, par: 53, record: 43, track: stage4() },
    { n: 5, name: 'STADIUM CROSS', hint: 'TWO LAPS. BUMP THE PACK BEFORE IT BUMPS YOU.', theme: Theme.Stadium, par: 50, record: 41, track: stage5() },
    { n: 6, name: 'THE CHAMPIONSHIP', hint: 'SEVEN RIDERS ON THE GRID. NO PAR TIME.', theme: Theme.Final, par: 0, record: 44, final: true, track: stage6() },
];
