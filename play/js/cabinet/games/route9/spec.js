// THE NODE · world 1 · ROUTE 9 (Northgate Novelty Co., 1985) on the Cabinet Engine · THE CARTRIDGE.
// Port of Route9Cartridge.cs.
//
// Palette: asphalt grey, lawn green, dusk orange, paper white, the house pastels and a red bike,
// plus the few supporting inks a dusk street needs (roofs, glass, hedges, skin, shadow).
//
// Knobs (Lab-tuned):
//   hazardsOff     one hazard type is kept off the route per lost round, in sim.js's RemovalOrder
//                  (cross traffic, dogs, parked cars, the mower, the trike, potholes); all six on the
//                  mercy credit, which also makes the bike uncrashable and the papers home in
//   potholeMargin  the pothole hitbox shrinks 10% per lost round
//   winMisses      misses still allowed on a won route. 0 = "deliver to every subscriber" (the brief)
import { Palette, PixelSprite, CabinetGameSpec, CabinetState, Knob } from '../../sdk/index.js';
import * as Art from './art.js';

export const Route9Palette = new Palette(
    ['bg', 0x0A0816],           // 0  night navy: the margin, outlines, plates
    ['paper', 0xF6F2E4],        // 1  paper white
    ['red', 0xE02830],          // 2  the bike, the cap, taillights
    ['asphalt', 0x55535E],      // 3
    ['asphaltDk', 0x3A3844],    // 4
    ['sidewalk', 0xA9A4A0],     // 5
    ['lawn', 0x4F9A3E],         // 6
    ['lawnDk', 0x2F6B2C],       // 7
    ['dusk', 0xFF8C2E],         // 8  dusk orange: porch lights, the accent
    ['gold', 0xFFD57A],         // 9  lit windows, the highlight
    ['pink', 0xEE9FB4],         // a  house pastels a-d
    ['blue', 0x8FB6E6],         // b
    ['mint', 0xA6DEC0],         // c
    ['lemon', 0xEEE39A],        // d
    ['roof', 0x86524A],         // e
    ['roofDk', 0x4E2F38],       // f
    ['glass', 0x283450],        // g  dark windows, windscreens
    ['purple', 0x5E4A86],       // h  dusk purple: dark houses, shadows of titles
    ['hedge', 0x1E4424],        // i
    ['brown', 0x9A6634],        // j  dogs, posts, doors
    ['skin', 0xF2B98C],         // k
    ['curb', 0xD2CDC6],         // l
    ['shadow', 0x24222C],       // m
    ['sidewalkDk', 0x8A8584],   // n
    ['denim', 0x3F5FA8],        // o
).roles('bg', 'paper', 'dusk', 'gold', 'purple');

function stamp(dst, src, x0, y0) {
    for (let y = 0; y < src.height; y++)
        for (let x = 0; x < src.width; x++) {
            const v = src.at(x, y);
            if (v >= 0) dst.set(x0 + x, y0 + y, v);
        }
}

// the title card's picture: the paperboy riding right, a paper arcing back into a mailbox
function buildTitleArt() {
    const a = new PixelSprite(104, 23);
    // the ground: lawn under the mailbox, sidewalk under the bike
    for (let x = 0; x < 104; x++) {
        a.set(x, 22, x < 24 ? 7 : 23);
        a.set(x, 21, x < 24 ? 6 : 5);
    }
    stamp(a, Art.MailboxWait, 6, 2);
    stamp(a, Art.BikeA, 76, 0);
    // the arc: dotted, from the bike's hand back to the box
    for (let x = 26; x <= 72; x += 3) {
        const u = (x - 26) / 46;
        const y = Math.trunc(8 + (1 - u) * 0 - 16 * 4 * u * (1 - u) * 0.5 + u * 2);
        a.set(x, y + 4, 1);
    }
    stamp(a, Art.Paper3, 29, 1);
    return a;
}

function buildSpec() {
    const s = new CabinetGameSpec({
        id: 'route9',
        name: 'ROUTE 9',
        publisher: 'NORTHGATE NOVELTY CO.',
        year: 1985,
        palette: Route9Palette,
        tagline: 'DELIVER TO ALL 12 SUBSCRIBERS',
        controls: ['STICK  CHANGE LANE / SPEED', 'BUTTON A  THROW A PAPER LEFT'],
        roundWonText: 'ROUTE DONE',
        roundLostText: 'GAME OVER',
        highScoreSeed: [3600, 3100, 2600, 2000, 1400],
        titleArt: buildTitleArt(),
        titleArtScale: 2,
        knobs: [
            Knob.fixed('cruiseSpeed', 32, 'px/s the bike rolls with the stick centred (x1.6 up, x0.5 down)'),
            Knob.add('hazardsOff', 0, 1, 'hazard types kept off the route (sim.js RemovalOrder)').clamp(0, 6).setOnMercy(6),
            Knob.add('potholeMargin', 0, 0.10, 'fraction the pothole hitbox shrinks').clamp(0, 0.5),
            Knob.fixed('winMisses', 0, 'misses allowed on a won route (0 = every subscriber)'),
            Knob.fixed('hazardDensity', 1, 'x the hazard counts (8 potholes, 5 cars, 4 dogs, 2 trikes, 2 mowers)'),
            Knob.fixed('dogTrigger', 88, 'px ahead of a dog when it runs out'),
            Knob.fixed('dogSpeed', 72, 'px/s a dog runs'),
            Knob.fixed('carSpeed', 110, 'px/s cross traffic (+-10% per crossing)'),
            Knob.fixed('trafficGap', 3.0, 's between cars in a crossing lane (plus up to 45% jitter)'),
            Knob.fixed('mailboxWindow', 6, 'px either side of a mailbox a paper still goes in'),
        ],
    });
    s.phaseNames.set(CabinetState.Intro, 'start');
    s.phaseNames.set(CabinetState.Playing, 'ride');
    s.phaseNames.set(CabinetState.Interlude, 'crash');
    return s;
}

export const Route9Spec = buildSpec();
