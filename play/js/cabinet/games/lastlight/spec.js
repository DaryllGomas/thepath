// THE NODE · world 1 · LAST LIGHT (Anvil and Sparks, 1982) on the Cabinet Engine · palette + SPEC.
// Port of LastLightCartridge.cs from Staging/Batch1/lastlight. Split from cartridge.js so the
// renderer and the round can read it without an import cycle.
//
// Missile Command on a moon base: six glass domes and three interceptor silos (10 shots each, for
// the whole round). MERCY: fallSpeed x0.9 per lost round (0.5 on the unlosable credit), and a
// reserve of refill shots (+0.5 silo loads per loss, capped at 0.5) that reloads the first silo to
// run dry once. Credit 5: missiles fall at half speed and the last dome cannot be destroyed (it
// bursts on a shield instead).
import { Palette, PixelSprite, CabinetGameSpec, CabinetState, Knob } from '../../sdk/index.js';

// index order matters for the title art / bomber sprite: '0'..'9'
export const LastLightPalette = new Palette(
    ['bg', 0x000000],          // 0 the lunar night
    ['dust', 0xA39D8C],        // 1 moondust grey: ground, mounds, labels
    ['dustDim', 0x46423A],     // 2 its shadow: craters, stars, rubble, fades
    ['cyan', 0x3CE4F4],        // 3 dome glass, interceptors, the player's things
    ['cyanDim', 0x125866],     // 4 dome fill (dithered), interceptor trails
    ['red', 0xFF3326],         // 5 missiles, the enemy
    ['redDim', 0x6E170F],      // 6 dying fires, spent strikes
    ['white', 0xFFFFFF],       // 7 blasts, warhead heads
    ['yellow', 0xFFE23C],      // 8 the crosshair, dome lights, blast rims
).roles('bg', 'dust', 'red', 'cyan', 'redDim');

// the saucer bomber, 16 x 6: a white canopy on a red hull, a moondust belly, red running lights
export const LastLightBomberSprite = PixelSprite.fromRows(
    '......777......',
    '....5577755....',
    '..55555555555..',
    '555555555555555',
    '..11111111111..',
    '...5...5...5...');

function line(sp, x0, y0, x1, y1, c) {
    let dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1, dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1, err = dx + dy;
    for (let guard = 0; guard < 512; guard++) {
        sp.set(x0, y0, c);
        if (x0 === x1 && y0 === y1) break;
        const e2 = 2 * err;
        if (e2 >= dy) { err += dy; x0 += sx; }
        if (e2 <= dx) { err += dx; y0 += sy; }
    }
}

function disc(sp, cx, cy, r, c) {
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r) sp.set(cx + x, cy + y, c);
}

function ring(sp, cx, cy, r, c) {
    for (let y = -r; y <= r; y++)
        for (let x = -r; x <= r; x++) {
            const d2 = x * x + y * y;
            if (d2 <= r * r && d2 > (r - 1) * (r - 1)) sp.set(cx + x, cy + y, c);
        }
}

function mound(sp, cx) {
    for (let row = 0; row < 4; row++) {
        const y = 18 - row, hw = 5 - row;
        for (let x = cx - hw; x <= cx + hw; x++) sp.set(x, y, 1);
    }
    sp.set(cx, 15, 2);
}

function dome(sp, cx) {
    const r = 6, baseY = 18;
    for (let y = baseY - r; y <= baseY; y++) {
        const dy = baseY - y;
        const hw = Math.round(Math.sqrt(r * r - dy * dy));
        for (let x = cx - hw; x <= cx + hw; x++) {
            const edge = x === cx - hw || x === cx + hw || y === baseY - r;
            sp.set(x, y, edge ? 3 : (((x + y) & 1) === 0 ? 4 : -1));
        }
    }
    for (let k = -3; k <= 3; k += 2) sp.set(cx + k, baseY - 1, 8);
    sp.set(cx, baseY - r - 1, 7);
}

// the title card's picture, 96 x 22 (x2 on the card): three lit domes and a silo on the moon, red
// trails coming down, one caught in a white blast fed by a cyan interceptor trail.
function buildTitleArt() {
    const W = 96, H = 22;
    const sp = new PixelSprite(W, H);
    for (let x = 0; x < W; x++) { sp.set(x, 19, 1); sp.set(x, 20, 2); sp.set(x, 21, (x % 7 === 3) ? 1 : 2); }
    for (let x = 0; x < W; x += 11) sp.set(x + 4, 18, 1);
    mound(sp, 9); mound(sp, 87);
    dome(sp, 32); dome(sp, 50); dome(sp, 68);
    line(sp, 2, 0, 26, 10, 5); sp.set(26, 10, 7);
    line(sp, 94, 0, 74, 12, 5); sp.set(74, 12, 7);
    line(sp, 60, 0, 56, 5, 5);
    line(sp, 9, 15, 44, 6, 4);
    disc(sp, 50, 6, 5, 7); ring(sp, 50, 6, 5, 8);
    line(sp, 80, 0, 84, 4, 6); sp.set(84, 4, 5);
    return sp;
}

const TitleArt = buildTitleArt();

function buildSpec() {
    const s = new CabinetGameSpec({
        id: 'lastlight',
        name: 'LAST LIGHT',
        publisher: 'ANVIL AND SPARKS',            // '&' is not in the Arcade font; spelled out
        year: 1982,
        palette: LastLightPalette,
        tagline: 'SIX DOMES. THIRTY SHOTS. ONE NIGHT.',
        controls: ['STICK  AIM      A  FIRE', 'NEAREST SILO FIRES. SAVE ONE DOME.'],
        roundWonText: 'WAVE SURVIVED',
        roundLostText: 'THE END',
        highScoreSeed: [2400, 2000, 1600, 1200, 900],
        titleArt: TitleArt,
        titleArtScale: 2,
        knobs: [
            Knob.mul('fallSpeed', 1.0, 0.9, 'enemy fall speed multiplier: 10% slower per lost round').setOnMercy(0.5),
            Knob.fixed('baseFall', 28.5, 'warhead px/s in wave 1'),
            Knob.fixed('waveRamp', 0.3, '+fall speed per sub-wave (x1.0, x1.3, x1.6)'),
            Knob.fixed('missiles', 8, 'warheads launched in sub-wave 1'),
            Knob.fixed('missileStep', 2, '+warheads per sub-wave'),
            Knob.fixed('spawnWindow', 19, 'seconds a sub-wave launches over'),
            Knob.fixed('mirvChance', 0.15, 'chance a warhead is a MIRV in sub-wave 1'),
            Knob.fixed('mirvStep', 0.1, '+MIRV chance per sub-wave'),
            Knob.fixed('smarts', 0, 'smart missiles in sub-wave 1'),
            Knob.fixed('smartStep', 1, '+smart missiles per sub-wave'),
            Knob.fixed('smartMul', 1.5, 'smart missile speed vs a warhead'),
            Knob.fixed('bomberChance', 0.35, 'chance of a bomber pass in sub-wave 1'),
            Knob.fixed('bomberStep', 0.35, '+bomber chance per sub-wave'),
            Knob.fixed('shots', 10, 'interceptors per silo for the whole round'),
            Knob.add('refills', 0, 0.5, 'mercy reserve in silo loads: the first silo to run dry reloads from it once').clamp(0, 0.5),
            Knob.fixed('blastRadius', 15, 'interceptor blast radius, px'),
            Knob.fixed('chainRadius', 9, 'blast radius of a destroyed warhead (chains)'),
            Knob.fixed('interceptorSpeed', 200, 'interceptor px/s (the centre silo x1.35)'),
        ],
    });
    s.phaseNames.set(CabinetState.Intro, 'wave_banner');
    s.phaseNames.set(CabinetState.Playing, 'play');
    s.phaseNames.set(CabinetState.Interlude, 'interlude');
    return s;
}

export const LastLightSpec = buildSpec();
