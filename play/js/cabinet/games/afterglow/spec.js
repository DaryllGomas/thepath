// THE NODE · world 1 · AFTERGLOW on the Cabinet Engine · the SPEC (data only) and the title art.
//
// A late-'80s sit-down jet shooter: behind the jet, sprite-scaled pseudo-3D, the horizon rolling with every
// bank and spinning with every barrel roll. Three stages (OPEN SEA, RED DESERT, AFTERGLOW CANYON), three
// jets, a lock-on for up to four homing missiles, a vulcan that fires itself, a bomber and a fortress per
// stage. Original IP: the publisher, the jets and the name are invented.
//
// MERCY, per round lost on this cabinet (credit N = N-1 losses; the bench is in NOTES.md):
//   credit 2  the enemy fires less (x0.86), its missiles turn less (x0.9), fewer aces, a bigger lock box
//   credit 3  again (fire x0.74, turn x0.81), the lock box grows again
//   credit 4  again, + ONE AUTO ROLL: a missile about to hit rolls the jet by itself (HUD lamp)
//   credit 5  cannot be lost: every missile about to hit gets an auto roll, nothing can take a jet
import { PixelSprite, CabinetGameSpec, CabinetState, Knob } from '../../sdk/index.js';
import { AfterglowPalette, ix } from './palette.js';
import { bake } from './raster.js';
import { heroMesh, HERO_MATS, HERO_NOZZLES } from './models.js';

export { AfterglowPalette };

// the title card's picture: the hero jet banking out of a striped sunset sun, afterburners lit. 236 x 46 at 1x.
function buildTitleArt() {
    const W = 236, H = 46;
    const spr = new PixelSprite(W, H);
    const put = (x, y, c) => { if (x >= 0 && y >= 0 && x < W && y < H) spr.set(x, y, c); };
    // the sun: a disc on the horizon line, cut by widening bands toward its base
    const scx = 150, scy = 40, R = 34;
    const sunRamp = [ix('sun0'), ix('sun1'), ix('yellow'), ix('s3sky0'), ix('orange'), ix('s3sky1'), ix('red'), ix('s3sky2')];
    for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
            const dx = x - scx, dy = y - scy;
            if (dx * dx + dy * dy > R * R || y > 40) continue;
            const h = scy - y;                                   // height above the horizon
            if (h < 20) { const band = (h + 40) % 7; if (band < Math.max(1, Math.round((20 - h) / 5))) continue; }
            put(x, y, sunRamp[Math.min(sunRamp.length - 1, Math.floor((y - (scy - R)) / (R / sunRamp.length)))]);
        }
    // the horizon: two long lines under the sun
    for (let x = 8; x < W - 8; x++) { put(x, 41, ix('s3sky2')); if (x > 30 && x < W - 30) put(x, 43, ix('s3sky3')); }
    // speed streaks behind the jet
    const streak = [[4, 13, 60, 'cloud2'], [10, 21, 72, 'cloud1'], [0, 29, 58, 'cloud3'], [16, 35, 40, 'cloud3']];
    for (const [x0, y, len, c] of streak) for (let x = x0; x < x0 + len; x++) put(x, y, ix(c));
    // the jet, three-quarter front, banking toward us
    const jet = bake(heroMesh(), { yaw: 2.55, roll: 0.42, pitch: 0.12, elev: 0.32, scale: 3.1, mats: HERO_MATS, ink: ix('ink'), pts: HERO_NOZZLES });
    const jx = 100, jy = 22;
    // the afterburners first (behind the jet): two flames streaming back from the nozzles
    for (const p of jet.pts) {
        const nx = jx + p[0], ny = jy + p[1];
        for (let k = 0; k < 18; k++) {
            const x = Math.round(nx - 1.3 * k), y = Math.round(ny - 0.2 * k);
            const c = k < 3 ? 'white' : k < 7 ? 'yellow' : k < 12 ? 'orange' : 'red';
            put(x, y, ix(c)); if (k < 10) put(x, y + 1, ix(k < 5 ? 'yellow' : 'orange'));
        }
    }
    for (let y = 0; y < jet.h; y++)
        for (let x = 0; x < jet.w; x++) {
            const v = jet.px[y * jet.w + x];
            if (v >= 0) put(jx - jet.ax + x, jy - jet.ay + y, v);
        }
    return spr;
}

export const TitleArt = buildTitleArt();

function buildSpec() {
    const s = new CabinetGameSpec({
        id: 'afterglow',
        name: 'AFTERGLOW',
        publisher: 'VECTORLINE AERO',
        year: 1987,
        palette: AfterglowPalette,
        tagline: 'LOCK ON. FIRE. ROLL. SURVIVE.',
        controls: ['STICK FLY      A  MISSILES', 'B BARREL ROLL  GUN FIRES ITSELF'],
        roundWonText: 'MISSION COMPLETE',
        roundLostText: 'GAME OVER',
        highScoreSeed: [200000, 160000, 120000, 80000, 40000],      // a won round is ~190-205k: only a great one tops it
        titleArt: TitleArt,
        titleArtScale: 1,
        knobs: [
            Knob.fixed('lives', 3, 'jets per round'),
            Knob.mul('fireRate', 1, 0.82, 'x how often enemies fire (aces, grunts, bomber, fortress)').clamp(0.55, 1),
            Knob.mul('missileTurn', 1, 0.88, 'x how hard enemy missiles turn after you').clamp(0.65, 1),
            Knob.add('aceShare', 0.28, -0.03, 'share of fighters that are aces (red; they fire)').clamp(0.19, 0.28),
            Knob.add('lockBox', 1, 0.1, 'x the lock box').clamp(1, 1.3),
            Knob.add('autoRolls', -2, 1, 'AUTO ROLL saves per round: 0,0,0,1 (credit 5: every missile)').clamp(0, 1),
        ],
    });
    s.phaseNames.set(CabinetState.Intro, 'stage');
    s.phaseNames.set(CabinetState.Playing, 'play');
    s.phaseNames.set(CabinetState.Interlude, 'clear');
    return s;
}

export const AfterglowSpec = buildSpec();
