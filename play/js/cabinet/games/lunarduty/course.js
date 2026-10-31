// THE NODE · world 1 · LUNAR DUTY (Anvil & Sparks, 1982) on the Cabinet Engine · THE COURSE.
// Expanded patrol routes; the original Unity parity is retired.
// Each sector introduces a new road problem; ranks thin the same layout on later credits.
import { f32, roundEven } from '../../sdk/index.js';

export const HazardKind = Object.freeze({ Crater: 0, Rock: 1, BigRock: 2, Mine: 3, Tank: 4 });

// a tiny deterministic RNG (xorshift32): the course and the round's dice
export class LunarRng {
    constructor(seed) {
        let s = (Math.imul(seed | 0, 2654435761) ^ 0x9E3779B9) >>> 0;
        if (s === 0) s = 0x1234567;
        this.s = s;
        for (let i = 0; i < 4; i++) this.next();
    }

    next() {
        let s = this.s;
        s = (s ^ (s << 13)) >>> 0;
        s = (s ^ (s >>> 17)) >>> 0;
        s = (s ^ (s << 5)) >>> 0;
        this.s = s;
        return s;
    }

    float() { return f32((this.next() >>> 8) * (1 / 16777216)); }
    range(a, b) { return f32(a + f32(f32(b - a) * this.float())); }
    int(n) { return n <= 1 ? 0 : Math.trunc(this.next() % n); }
    chance(p) { return this.float() < p; }
}

export function makeHazard(kind, x, w, rank, section) {
    return { kind, x: f32(x), w: f32(w), rank: f32(rank), section };
}

function width(k) {
    switch (k) {
        case HazardKind.Rock: return 10;
        case HazardKind.BigRock: return 14;
        case HazardKind.Mine: return 10;
        case HazardKind.Tank: return 24;
        default: return 24;
    }
}

export function hazardHeight(k) {
    switch (k) {
        case HazardKind.Rock: return 8;
        case HazardKind.BigRock: return 12;
        case HazardKind.Mine: return 4;
        case HazardKind.Tank: return 13;
        default: return 0;
    }
}

export const Sectors = [
    ['DUST SCHOOL', 'A JUMP CRATERS / HOLD B FIRE'],
    ['STONE RIVER', 'ROLLING STONES / SHOOT EARLY'],
    ['MINE GARDEN', 'RED MINES MUST BE JUMPED'],
    ['BOMB ALLEY', 'UP GUN STOPS BOMBS'],
    ['BLACK CROSSING', 'WIDE PITS / RIGHT FOR SPEED'],
    ['IRON HORIZON', 'BREAK THE WALKER / JUMP SHELLS'],
];
const Sections = Sectors.map((_, s) => ({
    gapMin: 270 - s * 12, gapMax: 400 - s * 10,
    crater: 0.40, rock: 0.32, big: 0.28, mine: s >= 2 ? 0.22 : 0,
    pair: 0, craterMin: s === 4 ? 46 : 24, craterMax: s === 4 ? 58 : 36 + s * 2,
    waveAt: s >= 3 ? [700, 1750] : [], waveCount: [2, 2],
    tankAt: s === 3 ? [2400] : s === 5 ? [900, 2100] : [], lead: 260,
}));
export const Checkpoints = Object.freeze([0, 3000, 6000, 9000, 12000, 15000, 18000]);
export const Letters = 'ABCDEFG';
export const End = Checkpoints[Checkpoints.length - 1];
const CourseSeed = 1982;

function pickPairKind(rng, section) {
    const r = rng.float();
    if (r < 0.45) return HazardKind.Crater;
    if (r < 0.75) return HazardKind.Rock;
    if (section >= 2 && r < 0.9) return HazardKind.Mine;
    return HazardKind.BigRock;
}

function make(kind, x, rng, spec, s) {
    const w = kind === HazardKind.Crater ? roundEven(rng.range(spec.craterMin, spec.craterMax)) : width(kind);
    return makeHazard(kind, x, w, rng.float(), s);
}

function build() {
    const hazards = [];
    const waves = [];
    const rng = new LunarRng(CourseSeed);
    for (let s = 0; s < Sections.length; s++) {
        const spec = Sections[s];
        const a = Checkpoints[s], b = Checkpoints[s + 1];
        const keepOut = [];
        for (const t of spec.tankAt) {
            const tx = f32(a + t);
            hazards.push(makeHazard(HazardKind.Tank, tx, width(HazardKind.Tank), 0, s));
            keepOut.push(tx);
        }
        let x = f32(a + spec.lead);
        const end = f32(b - 130);
        const wsum = f32(f32(f32(f32(spec.crater + spec.rock) + spec.big) + spec.mine) + spec.pair);
        while (x < end) {
            let roll = f32(rng.float() * wsum);
            const placed = [];
            if ((roll = f32(roll - spec.crater)) < 0) placed.push(make(HazardKind.Crater, x, rng, spec, s));
            else if ((roll = f32(roll - spec.rock)) < 0) placed.push(make(HazardKind.Rock, x, rng, spec, s));
            else if ((roll = f32(roll - spec.big)) < 0) placed.push(make(HazardKind.BigRock, x, rng, spec, s));
            else if ((roll = f32(roll - spec.mine)) < 0) {
                placed.push(make(HazardKind.Mine, x, rng, spec, s));
                if (rng.chance(0.4)) placed.push(make(HazardKind.Mine, f32(x + 16), rng, spec, s));
            } else {
                const first = make(pickPairKind(rng, s), x, rng, spec, s);
                placed.push(first);
                const x2 = f32(first.x + first.w + rng.range(34, 56));
                placed.push(make(pickPairKind(rng, s), x2, rng, spec, s));
            }
            const last = placed[placed.length - 1];
            const far = f32(last.x + last.w);
            let blocked = false;
            for (const k of keepOut) if (far > k - 90 && x < k + width(HazardKind.Tank) + 90) blocked = true;
            if (far > end) blocked = true;
            if (!blocked) hazards.push(...placed);
            x = f32((blocked ? f32(x + 40) : far) + rng.range(spec.gapMin, spec.gapMax));
        }
        for (let w = 0; w < spec.waveAt.length; w++) {
            const ranks = new Array(spec.waveCount[w]);
            for (let i = 0; i < ranks.length; i++) ranks[i] = i === 0 ? rng.range(0, 0.5) : rng.float();
            waves.push({ triggerX: f32(a + spec.waveAt[w]), ranks, section: s });
        }
    }
    hazards.sort((p, q) => p.x - q.x);
    waves.sort((p, q) => p.triggerX - q.triggerX);
    return { hazards, waves };
}

const built = build();
export const Hazards = built.hazards;
export const Waves = built.waves;

export function sectionOf(x) {
    for (let i = 1; i < Checkpoints.length; i++) if (x < Checkpoints[i]) return i - 1;
    return Checkpoints.length - 2;
}
