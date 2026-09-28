// THE NODE · world 1 · LUNAR DUTY (Anvil & Sparks, 1982) on the Cabinet Engine · THE COURSE.
// Port of LunarDutyCourse.cs.
//
// One fixed course, the same on every credit, like the real board: point A (the start) to point E
// in four sections, 5650 px of moon at a 72 px/s cruise (about 78 s with no crash).
//
//   A-B  craters and rocks, one lone UFO                       (the gentle section)
//   B-C  wider craters, stacked pairs, two UFO waves
//   C-D  mines, three UFO waves, a tank guarding point D
//   D-E  everything, a tank mid-section and a tank before E
//
// Every hazard carries a fixed RANK in 0..1. A round keeps the ones whose rank is under its
// hazardDensity knob, so the mercy rule thins the same course (x0.9 per lost round) rather than
// rolling a new one. Tanks are never thinned. UFOs are thinned per ship the same way.
// The layout comes from LunarRng (xorshift), never SystemRandom, so it is identical on every
// runtime (the Lab's node and a browser).
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

const Sections = [
    { gapMin: 105, gapMax: 165, crater: 0.45, rock: 0.35, big: 0.20, mine: 0, pair: 0, craterMin: 24, craterMax: 37,
      waveAt: [640], waveCount: [1], tankAt: [], lead: 240 },
    { gapMin: 95, gapMax: 150, crater: 0.38, rock: 0.22, big: 0.18, mine: 0, pair: 0.22, craterMin: 29, craterMax: 44,
      waveAt: [160, 760], waveCount: [2, 2], tankAt: [], lead: 170 },
    { gapMin: 90, gapMax: 140, crater: 0.28, rock: 0.18, big: 0.14, mine: 0.20, pair: 0.20, craterMin: 32, craterMax: 49,
      waveAt: [180, 720, 1100], waveCount: [2, 3, 1], tankAt: [1250], lead: 170 },
    { gapMin: 85, gapMax: 135, crater: 0.28, rock: 0.16, big: 0.14, mine: 0.20, pair: 0.22, craterMin: 34, craterMax: 54,
      waveAt: [150, 620, 1060], waveCount: [2, 3, 2], tankAt: [700, 1340], lead: 170 },
];

export const Checkpoints = Object.freeze([0, 1300, 2700, 4150, 5650]);
export const Letters = 'ABCDE';
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
