// THE NODE · world 1 · SUNSET DRIVE on the Cabinet Engine · the SPEC (data only) and the title art.
//
// A late-'80s sit-down road racer: behind the car, sprite-scaled road with curves, crests, a fork and
// three stages, traffic to weave through, a clock that checkpoints extend. Original: the name, the
// publisher (SUNDOWN AMUSEMENTS), the car, the brands on the billboards, the course.
//
// MERCY, per round lost on this cabinet (credit N = N-1 earlier losses; see NOTES.md for the bench):
//   credit 2+  more time at the start and at each checkpoint, thinner traffic, a lighter pull in the
//              bends, shorter tumbles, and a rear-ending has to be harder before it is a crash
//   credit 5   cannot be lost (credit.unlosable): FREE DRIVE (the clock is off), thin traffic, and the car
//              steers itself whenever the stick is let go (and cruises when no pedal is held either)
import { PixelSprite, CabinetGameSpec, CabinetState, Knob, Rgba } from '../../sdk/index.js';
import { SunsetPalette } from './palette.js';
import { Canvas, h01 } from './blit.js';
import { Art } from './art.js';

// ------------------------------------------------------------------ title art: the causeway into the sunset
// Drawn on a Canvas in palette colours, then turned into a PixelSprite over the first 36 palette entries
// (the only ones a title sprite can index); any other colour snaps to the nearest of those 36.
function titleArt() {
    const W = 224, H = 48, HZ = 27;
    const cv = new Canvas(W, H);
    const pal = SunsetPalette, K = n => pal.get(n).packed;
    // the sky
    const bands = ['violet', 'purple', 'magenta', 'pink', 'orange', 'yellow'];
    for (let y = 0; y < HZ; y++) {
        const f = y / HZ * bands.length, b = Math.min(bands.length - 1, Math.floor(f)), fr = f - b;
        for (let x = 0; x < W; x++) cv.set(x, y, K(fr > 0.72 && b < bands.length - 1 && ((x + y) & 1) ? bands[b + 1] : bands[b]));
    }
    // the sun, striped, on the horizon
    const sx = 112, sy = HZ - 1, r = 21;
    for (let dy = -r; dy <= 0; dy++) {
        const hw = Math.sqrt(r * r - dy * dy), f = (dy + r) / r;
        if (f > 0.45 && ((dy + r) % 5) < 1 + Math.floor((f - 0.45) * 5)) continue;
        const col = f < 0.3 ? 'sunHi' : f < 0.6 ? 'sun' : f < 0.85 ? 'sunLo' : 'pink';
        for (let x = Math.round(sx - hw); x <= Math.round(sx + hw); x++) cv.set(x, sy + dy, K(col));
    }
    // a far headland
    for (let x = 0; x < 70; x++) { const h = Math.round(4 + 3 * Math.sin(x * 0.09) - x * 0.05); for (let y = HZ - h; y < HZ; y++) cv.set(x, y, K('purple')); }
    for (let x = 170; x < W; x++) { const h = Math.round(2 + (x - 170) * 0.09 + Math.sin(x * 0.3)); for (let y = HZ - h; y < HZ; y++) cv.set(x, y, K('purple')); }
    // the sea and the sun's path on it
    for (let y = HZ; y < H; y++) {
        const d = y - HZ;
        for (let x = 0; x < W; x++) cv.set(x, y, K(d < 2 ? 'seaHi' : d < 7 ? 'sea' : 'seaLo'));
        const hw = 6 + d * 1.2;
        for (let k = 0; k < 4; k++) {
            const gx = Math.round(sx + (h01(y, k) - 0.5) * hw * 2), len = 1 + Math.floor(h01(y, k + 5) * 4);
            for (let i = 0; i < len; i++) cv.set(gx + i, y, K(k & 1 ? 'yellow' : 'cream'));
        }
    }
    // the road on its causeway, running to the horizon under the sun
    for (let y = HZ; y < H; y++) {
        const d = (y - HZ + 0.5) / (H - HZ), hw = 3 + d * 62, cx = sx;
        const z = 1 / (d + 0.04), band = Math.floor(z * 2.2) & 1;
        const rum = Math.max(1, hw * 0.12);
        for (let x = Math.round(cx - hw - rum); x <= Math.round(cx + hw + rum); x++) cv.set(x, y, K(band ? 'red' : 'white'));
        for (let x = Math.round(cx - hw); x <= Math.round(cx + hw); x++) cv.set(x, y, K(band ? 'asphalt' : 'asphaltLo'));
        if (band) for (const f of [-1 / 3, 1 / 3]) cv.set(Math.round(cx + hw * f), y, K('white'));
    }
    // palms at both sides, backlit
    const palmSil = (bx, lean, hgt) => {
        for (let t = 0; t < hgt; t++) { const x = bx + lean * (t / hgt) * (t / hgt) * 10; cv.set(x, H - 1 - t, K('ink')); cv.set(x + 1, H - 1 - t, K('ink')); }
        const tx = bx + lean * 10, ty = H - 1 - hgt;
        for (let k = 0; k < 8; k++) {
            const a = Math.PI + k * Math.PI / 7 + (h01(bx, k) - 0.5) * 0.3, L = 10 + h01(bx, k + 9) * 5;
            for (let s = 0; s <= L; s++) { const x = tx + Math.cos(a) * s, y = ty + Math.sin(a) * s * 0.7 + s * s * 0.03; cv.set(x, y, K('ink')); cv.set(x, y + 1, K(s > L * 0.5 ? 'palmLo' : 'ink')); }
        }
    };
    palmSil(18, 1, 40); palmSil(38, 1.3, 30); palmSil(204, -1, 42); palmSil(186, -0.8, 28);
    // the car, from the game's own sprite, shrunk to a third
    const hero = Art.hero[2][1];
    const cw = Math.floor(hero.w / 3), ch = Math.floor(hero.h / 3);
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
        const p = hero.px[(y * 3 + 1) * hero.w + x * 3 + 1];
        if (p && p !== K('shadow')) cv.set(sx - (cw >> 1) + x, H - ch + y, p);
    }
    // to palette indices 0..35
    const first = [];
    for (let i = 0; i < 36; i++) first.push(pal.at(i));
    const idx = new Map();
    const nearest = (p) => {
        if (idx.has(p)) return idx.get(p);
        const q = Rgba.fromPacked(p);
        let best = 0, bd = Infinity;
        for (let i = 1; i < 36; i++) { const e = first[i], d = (e.r - q.r) ** 2 + (e.g - q.g) ** 2 + (e.b - q.b) ** 2; if (d < bd) { bd = d; best = i; } }
        idx.set(p, best);
        return best;
    };
    for (let i = 0; i < 36; i++) if (!idx.has(first[i].packed)) idx.set(first[i].packed, i);
    const spr = new PixelSprite(W, H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const p = cv.px[y * W + x]; if (p) spr.set(x, y, nearest(p)); }
    return spr;
}

function buildSpec() {
    const s = new CabinetGameSpec({
        id: 'sunsetdrive',
        name: 'SUNSET DRIVE',
        publisher: 'SUNDOWN AMUSEMENTS',
        year: 1987,
        palette: SunsetPalette,
        tagline: 'RACE THE SUN TO THE BAY',
        controls: ['STICK STEER   A OR UP GAS   B OR DOWN BRAKE', 'CHECKPOINTS ADD TIME - PICK A ROAD AT THE FORK'],
        roundWonText: 'GOAL!',
        roundLostText: 'GAME OVER',
        highScoreSeed: [120000, 100000, 80000, 60000, 40000],
        titleArt: titleArt(),
        titleArtScale: 1,
        knobs: [
            Knob.add('timeStart', 50, 0.5, 'seconds on the clock at the start').clamp(50, 52).setOnMercy(99),
            Knob.add('extend1', 42, 0.5, 'seconds the first CHECKPOINT adds (stage 2 is the long one)').clamp(42, 44),
            Knob.add('extend2', 32, 0.5, 'seconds the second CHECKPOINT adds').clamp(32, 34),
            Knob.mul('traffic', 1, 0.93, 'x traffic density').clamp(0.75, 1).capOnMercy(0.45),
            Knob.mul('grip', 1, 0.97, 'x the pull toward the outside of a bend').clamp(0.88, 1).setOnMercy(0.7),
            Knob.add('crashSeconds', 2.6, -0.1, 'seconds a crash tumbles (the clock runs on)').clamp(2.2, 2.6).setOnMercy(1.4),
            Knob.add('crashRel', 0.40, 0.03, 'closing speed (x top) at which hitting a car is a crash, not a bump').clamp(0.4, 0.5).setOnMercy(0.9),
            Knob.fixed('assist', 0, 'hands-off steering (credit 5 only)').setOnMercy(1),
        ],
    });
    s.phaseNames.set(CabinetState.Intro, 'countdown');
    s.phaseNames.set(CabinetState.Playing, 'play');
    s.phaseNames.set(CabinetState.Interlude, 'finish');
    return s;
}

export const SunsetSpec = buildSpec();
