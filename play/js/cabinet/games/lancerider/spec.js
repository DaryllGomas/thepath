// THE NODE · world 1 · LANCE RIDER on the Cabinet Engine · THE CARTRIDGE: spec + factories (data only).
// Split from cartridge.js so the renderer and the round can read it without an import cycle.
//
// Port of LanceRiderCartridge.cs. Palette: black sky, stone grey (three steps), lava orange
// (dark/orange/hot), rider blue (+light), egg gold (+dark), white; the player's pale-gold steed,
// the rivals' green buzzards, and their armour: bounder red, hunter silver, shadow lord violet.
//
// Knobs (Lab: --knob name=value tunes the BASE, mercy eases it per loss):
//   rivalAltitude  1.0 x0.9/loss   THE CORE MERCY: every rival's target altitude, -10% per loss
//   rivalSpeed     0.95            multiplier on the tier air speeds (66 / 82 / 98 px/s)
//   ...plus the wave's make-up, the egg timer and the lava hand; see Knobs below.
// The unlosable credit (5) is a RULE in the sim (rivals never above the player, the player cannot
// lose), not a knob.
import { Palette, PixelSprite, CabinetGameSpec, CabinetState, Knob } from '../../sdk/index.js';
import { FDown, FStand, frameRows, variantMap, make } from './sprites.js';

export const LanceRiderPalette = new Palette(
    ['sky', 0x000000],
    ['stone', 0x8A8478],
    ['stoneDark', 0x4A453E],
    ['stoneLight', 0xC6BFAF],
    ['lava', 0xFF6A10],
    ['lavaDark', 0x9A2A06],
    ['lavaHot', 0xFFE890],
    ['rider', 0x3C78FF],
    ['riderLight', 0xA8C8FF],
    ['egg', 0xF0C020],
    ['eggDark', 0x9A6A08],
    ['white', 0xFFFFFF],
    ['steed', 0xE8DAB0],
    ['steedDark', 0xA88E58],
    ['buzzard', 0x3CA040],
    ['buzzardDark', 0x1C5A24],
    ['bounder', 0xE03828],
    ['hunter', 0xD2DCF0],
    ['lord', 0xA048F0],
).roles('sky', 'stoneLight', 'lava', 'egg', 'lavaDark');

// the title card's picture: the blue knight diving on a red bounder over the lava, lances crossing
// in a spark, a stone ledge under the bounder
function buildTitleArt() {
    const W = 72, H = 20;
    const art = new PixelSprite(W, H);
    const P = LanceRiderPalette;
    const hero = make(frameRows(FDown), variantMap(P, 0, true));
    const foe = make(frameRows(FStand), variantMap(P, 1, true));
    stamp(art, hero, 11, 0, false);
    stamp(art, foe, 43, 2, true);
    // the spark where the lances meet
    const sx = 35, sy = 5;
    const white = P.indexOf('white'), gold = P.indexOf('egg'), hot = P.indexOf('lavaHot');
    art.set(sx, sy, white); art.set(sx - 1, sy, hot); art.set(sx + 1, sy, hot); art.set(sx, sy - 1, hot); art.set(sx, sy + 1, hot);
    art.set(sx - 2, sy - 2, gold); art.set(sx + 2, sy - 2, gold); art.set(sx - 2, sy + 2, gold); art.set(sx + 2, sy + 2, gold);
    // a ledge under the bounder
    const st = P.indexOf('stone'), sl = P.indexOf('stoneLight'), sd = P.indexOf('stoneDark');
    for (let x = 36; x < 68; x++) { art.set(x, 18, sl); art.set(x, 19, x % 9 === 0 ? sd : st); }
    // the lava floor under the diving knight
    const lv = P.indexOf('lava');
    for (let x = 0; x < 34; x++) { art.set(x, 18, Math.trunc(x / 3) % 2 === 0 ? hot : lv); art.set(x, 19, lv); }
    return art;
}

function stamp(dst, src, ox, oy, flip) {
    for (let y = 0; y < src.height; y++)
        for (let x = 0; x < src.width; x++) {
            const v = src.at(flip ? src.width - 1 - x : x, y);
            if (v >= 0) dst.set(ox + x, oy + y, v);
        }
}

function buildSpec() {
    const s = new CabinetGameSpec({
        id: 'lancerider',
        name: 'LANCE RIDER',
        publisher: 'ANVIL AND SPARKS',
        year: 1982,
        palette: LanceRiderPalette,
        tagline: 'THE HIGHER LANCE WINS',
        controls: ['STICK  STEER YOUR BIRD', 'A  FLAP YOUR WINGS', 'UNHORSE THEM  TAKE THE EGGS'],
        roundWonText: 'ROUND WON',
        roundLostText: 'GAME OVER',
        highScoreSeed: [12000, 9500, 7500, 5000, 3000],
        titleArt: buildTitleArt(),
        titleArtScale: 2,
        knobs: [
            Knob.mul('rivalAltitude', 1.0, 0.9, 'rival target altitude; Core mercy: -10% per loss'),
            Knob.fixed('rivalSpeed', 0.95, 'x tier air speed (66/82/98 px/s)'),
            Knob.fixed('rivalReaction', 1.0, 'x tier decision interval (0.50/0.34/0.22 s)'),
            Knob.fixed('rivalChase', 0.8, 'x tier chance a decision hunts the player (0.45/0.75/0.95)'),
            Knob.fixed('rivalEvade', 1.5, 'x tier chance to break away and climb when the player is above (0.20/0.55/0.80)'),
            Knob.fixed('rivalApproach', 120, 'px: a hunting rival closes the last stretch only when level with its aim'),
            Knob.fixed('rivalLevel', 6, 'px: how level (vs its aim height) a hunting rival must be to close in'),
            Knob.fixed('waveMin', 5, 'rivals in a wave, low'),
            Knob.fixed('waveMax', 8, 'rivals in a wave, high'),
            Knob.fixed('hunterShare', 0.30, 'chance a rider of the wave is a hunter'),
            Knob.fixed('lordShare', 0.10, 'chance a rider of the wave is a shadow lord'),
            Knob.fixed('startRivals', 2, 'riders on the field when the wave opens'),
            Knob.fixed('maxActive', 3, 'most rivals on the field at once (hatchlings included)'),
            Knob.fixed('spawnGap', 8.5, 'seconds between riders riding in (x0.8..1.3)'),
            Knob.fixed('tieBand', 3, 'px: lances this close in height bounce instead of deciding'),
            Knob.fixed('hatchSeconds', 8, 'an egg on a ledge hatches after this'),
            Knob.fixed('escapeFlaps', 5, 'flaps to tear free of the lava hand'),
            Knob.fixed('handSkim', 0.30, 'seconds skimming the pits before the hand rises'),
            Knob.fixed('lives', 3, 'lives per round'),
        ],
    });
    s.phaseNames.set(CabinetState.Intro, 'wave_start');
    s.phaseNames.set(CabinetState.Playing, 'joust');
    s.phaseNames.set(CabinetState.Interlude, 'unhorsed');
    return s;
}

export const LanceRiderSpec = buildSpec();
