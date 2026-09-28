// THE NODE · world 1 · STARVECTOR on the Cabinet Engine · the palette and the SPEC (data only).
// Split from cartridge.js so the renderer and the round can read it without an import cycle.
//
// The look is the cabinet's concept play frames (assets/art/sv_play_01..04): thin bright wireframe on a
// black tube, pale cyan-white rocks, a white paper-dart ship with a cyan keel and pods, a red saucer, cyan
// shots, red enemy shots. The marquee (ORBITAL ELECTRONICS) gives the title: white over cyan, red shadow.
//
// MERCY, per round lost on this cabinet (bench: 36 / 56 / 60 / 87 / 100 %, rounds 64-67 s):
//   credit 2  the rocks drift slower, the saucer aims worse and fires slower, the shield gauge grows
//   credit 3  + wave 3 has one large rock fewer (4/5/5; Unity shrank every wave x0.85, which cut the
//             rounds under a minute), the shield grows again
//   credit 4  + ONE SHIELD ASSIST: a hit that would take the ship raises the shield by itself (HUD lamp)
//   credit 5  cannot be lost (Unity's rule): shields hold, the saucer holds its fire, hands off = the gun
//             lines itself up
import { Palette, PixelSprite, CabinetGameSpec, CabinetState, Knob } from '../../sdk/index.js';
import { DODECA, SHIP, rasterRows, rockEdges } from './shapes.js';

export const StarvectorPalette = new Palette(
    ['bg', 0x02030A],          // 0 the tube
    ['navy', 0x0F1A44],        // 1 faint labels, the dotted rule
    ['rockGlow', 0x123A48],    // 2 the last spark step (and the optional rock halo)
    ['rockDim', 0x4C8496],     // 3 spark fade, dim HUD labels, the lost card's WAVES line
    ['rock', 0xD2F4FF],        // 4 rock outlines, HUD text
    ['white', 0xFFFFFF],       // 5 the ship
    ['shipDim', 0x5A6E88],     // 6 the ship's folds, wreck fade
    ['cyan', 0x38D8FF],        // 7 keel, pods, flame, your shots, the shield
    ['cyanDim', 0x0C4660],     // 8 shield dashes at rest, cyan fade
    ['red', 0xFF2E2E],         // 9 the saucer, its shots, the title shadow
    ['redDim', 0x6A0A12],      // a saucer wreck fade
).roles('bg', 'rock', 'cyan', 'white', 'red');

// the title card's picture, drawn from the game's own vector models (shapes.js): the paper dart streaking
// right on the marquee's red trail toward a tumbling pentagon rock. 110 x 24, shown at 2x.
const TitleArt = PixelSprite.fromRows(...rasterRows(110, 24, (line, dot) => {
    // the red trail, widening toward the ship (the marquee's streak)
    for (let d = -3; d <= 3; d++) { const x0 = 8 + Math.abs(d) * 11; line(x0 - 6, 12 + d, x0 - 1, 12 + d, 'a'); line(x0, 12 + d, 57, 12 + d, '9'); }
    // the dart, nose right
    const k = 1.15, cx = 70, cy = 12;
    const put = (list, ch) => { for (const q of list) line(cx + q[0] * k, cy + q[1] * k, cx + q[2] * k, cy + q[3] * k, ch); };
    put(SHIP.pods, '7'); put(SHIP.folds, '6'); put(SHIP.keel, '7'); put(SHIP.hull, '5');
    // the rock
    const rock = { ang: 0.6, ax: 0.35, ay: 0.8, az: 0.49, e0: 0.5, e1: 1.2, e2: 0.3 };
    rockEdges(DODECA, rock, 99, 11, 10.5, null, (x0, y0, x1, y1) => line(x0, y0, x1, y1, '4'));
}));

function buildSpec() {
    const s = new CabinetGameSpec({
        id: 'starvector',
        name: 'STARVECTOR',
        publisher: 'ORBITAL ELECTRONICS',
        year: 1982,
        palette: StarvectorPalette,
        tagline: 'CLEAR THREE WAVES WITH THREE SHIPS',
        controls: ['STICK  TURN    UP  THRUST', 'A      FIRE    B   SHIELD'],
        roundWonText: 'ROUND WON',
        roundLostText: 'GAME OVER',
        highScoreSeed: [16000, 13500, 11000, 8500, 6000],     // a won round is ~14-16k: a great one tops the table
        titleArt: TitleArt,
        titleArtScale: 2,
        knobs: [
            Knob.fixed('ships', 3, 'ships per round (Unity: THREE SHIPS)'),
            Knob.mul('waveScale', 1, 0.95, 'x the large rocks per wave: 4/5/6, from credit 3 4/5/5').clamp(0.9, 1),
            Knob.mul('rockSpeed', 0.96, 0.94, 'x rock drift speed (eases once, at credit 2)').clamp(0.92, 0.96),
            Knob.add('saucerAim', 0.30, 0.20, 'saucer aim error, radians either side').clamp(0.3, 0.5),
            Knob.add('saucerFireEvery', 1.6, 0.5, 'seconds between saucer shots').clamp(1.6, 2.1),
            Knob.fixed('saucerEvery', 14, 'seconds between saucer passes'),
            Knob.add('shieldSeconds', 2.0, 1.5, 'shield energy per wave, seconds (the gauge grows)').clamp(2, 8),
            Knob.add('shieldAssist', -2, 1, 'SHIELD ASSIST saves per round: 0,0,0,1 (credit 5: shields hold)').clamp(0, 1),
        ],
    });
    s.phaseNames.set(CabinetState.Intro, 'countdown');
    s.phaseNames.set(CabinetState.Playing, 'play');
    s.phaseNames.set(CabinetState.Interlude, 'wave');
    return s;
}

export const StarvectorSpec = buildSpec();
