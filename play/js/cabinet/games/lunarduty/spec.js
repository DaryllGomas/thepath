// THE NODE · world 1 · LUNAR DUTY (Anvil & Sparks, 1982) on the Cabinet Engine · THE CARTRIDGE: spec + factories.
// Port of LunarDutyCartridge.cs.
//
// Palette = the brief's six (void black, moondust grey, dome cyan, missile red, buggy tan, UFO
// magenta) plus one or two darker steps of each for the parallax layers, shading and the palette
// fades. The title art is the accepted cabinet art's moment: the six-wheeled buggy in the air over
// a crater, a cannon shot on its way to a rock, a UFO letting go of a bomb.
//
// Knobs (Mercy.resolve eases them per round already lost on this cabinet):
//   hazardDensity  share of the fixed course's rocks, craters, mines and UFOs that are there (x0.9/loss)
//   craterWidth    crater width scale, the course's and the bombs' (x0.92/loss)
//   bombRate       how often the UFOs bomb (x0.9/loss); 0 on the unlosable credit
//   speed          cruise speed, px/s
//   tankInterval   seconds between a tank's shells
import { Palette, PixelSprite, CabinetGameSpec, CabinetState, Knob, roundEven } from '../../sdk/index.js';
import * as Sprites from './sprites.js';

export const LunarDutyPalette = new Palette(
    ['void', 0x04040A],
    ['dust', 0xC4C0B8],
    ['dustDim', 0x7C7A76],
    ['dustDark', 0x3A3A40],
    ['cyan', 0x48C8F0],
    ['cyanDim', 0x1C4A6C],
    ['red', 0xF03C3C],
    ['tan', 0xD8B080],
    ['tanDim', 0x8A6A44],
    ['magenta', 0xF050B0],
    ['magentaDim', 0x74205A],
    ['white', 0xFFFFFF],
    ['redDim', 0x741C1C],
).roles('void', 'dust', 'cyan', 'dust', 'cyanDim');

function stamp(dst, src, x, y) {
    for (let j = 0; j < src.height; j++)
        for (let i = 0; i < src.width; i++) {
            const v = src.at(i, j);
            if (v >= 0) dst.set(x + i, y + j, v);
        }
}

// the title card's picture (112 x 24 at x2): the buggy in the air over a crater, a cannon
// shot on its way to a rock, a UFO dropping a bomb
function buildTitleArt() {
    const art = new PixelSprite(112, 24);
    for (let x = 0; x < 112; x++) {
        const pit = x >= 24 && x < 50;
        if (!pit) { art.set(x, 21, 1); art.set(x, 22, 2); art.set(x, 23, 2); }
        else {
            const u = (x - 24) / 26, v = 2 * u - 1;
            const d = roundEven(2.6 * Math.sqrt(Math.max(0, 1 - v * v)));
            for (let y = 21 + d; y < 24; y++) art.set(x, y, y === 21 + d ? 3 : 2);
        }
    }
    stamp(art, Sprites.Rock, 80, 13);
    stamp(art, Sprites.Body, 22, 0);
    for (let i = 0; i < 3; i++) stamp(art, Sprites.Wheels[i], 22 + Sprites.WheelX[i] - 4, 10);
    stamp(art, Sprites.Shot, 60, 9);
    stamp(art, Sprites.Ufo[0], 94, 0);
    stamp(art, Sprites.Bomb, 100, 11);
    return art;
}

function buildSpec() {
    const s = new CabinetGameSpec({
        id: 'lunarduty',
        name: 'LUNAR DUTY',
        publisher: 'ANVIL AND SPARKS',
        year: 1982,
        palette: LunarDutyPalette,
        tagline: 'PATROL THE MOON FROM POINT A TO E',
        controls: ['STICK SPEED   A JUMP   B FIRE', 'JUMP THE CRATERS  SHOOT THE REST'],
        roundWonText: 'ROUND WON',
        roundLostText: 'GAME OVER',
        highScoreSeed: [9000, 7500, 6000, 4500, 3000],
        titleArt: buildTitleArt(),
        titleArtScale: 2,
        knobs: [
            Knob.mul('hazardDensity', 1.0, 0.90, "share of the course's hazards and UFOs that are there").clamp(0.3, 1),
            Knob.mul('craterWidth', 1.0, 0.96, 'crater width scale (course + bomb craters)').clamp(0.5, 1.2),
            Knob.mul('bombRate', 1.4, 0.88, 'how often a UFO bombs').clamp(0, 3).setOnMercy(0),
            Knob.fixed('bombAim', 0.4, 'share of the bombs dropped right over the buggy'),
            Knob.fixed('speed', 72, 'cruise speed px/s (the stick gives +-25%)'),
            Knob.mul('tankInterval', 2.2, 1.12, "seconds between a tank's shells").clamp(1, 5),
        ],
    });
    s.phaseNames.set(CabinetState.Intro, 'ready');
    s.phaseNames.set(CabinetState.Playing, 'patrol');
    s.phaseNames.set(CabinetState.Interlude, 'interlude');      // a crash, or the roll-out past point E
    return s;
}

export const LunarDutySpec = buildSpec();
