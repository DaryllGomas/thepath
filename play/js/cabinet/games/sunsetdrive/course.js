// THE NODE · world 1 · SUNSET DRIVE · THE COURSE (built once, shared read-only by every round).
//
//   STAGE 1  PALM COAST   the sea on the left, palms, surf shacks, billboards, one big crest
//   CHECKPOINT, then THE FORK: the road widens, a median opens at the sign (hit it = crash), the two
//            roads pull apart. Whichever side of the median you are on is your road.
//   STAGE 2  CANYON RUN (left)   red rock, spires, cacti, tight S-bends, lighter traffic
//            VISTA HILLS (right) cypress alleys, farmhouses, big blind crests, heavier traffic
//   CHECKPOINT
//   STAGE 3  SUNSET BAY   the sea on the right, lamps, motels, the sun going into the sea; GOAL
//
// The course is two TRACKS (arrays of segments) that share the same first stage and fork segments; a round
// switches from one to the other at the fork tip. A segment:
//   i z y curve          index, start z, height at its start (its end = the next one's start), curve
//   r0 r1 n gh           road centres (x in road half-widths on the global line), road count, ghost road
//                        index (-1 none): a ghost road is drawn but not driven (the route not taken, leaving)
//   ter terR split       ground: terrain left of x = split, terR right of it (split NaN = one terrain)
//   seaL seaR            the shore lines (x); water beyond them
//   band line mark       light/dark band, a painted line across the road (1 checkered, 2 white), event mark
//   sprites              [{ k: kind id, x, flip }]
import { SystemRandom } from '../../sdk/index.js';
import { SEG, RUMBLE, Ter, Mark, TER_NAMES } from './constants.js';
import { KIND } from './art.js';

const E = { easeIn: (a, b, p) => a + (b - a) * p * p, easeInOut: (a, b, p) => a + (b - a) * (-Math.cos(p * Math.PI) / 2 + 0.5) };
const NONE_L = -1e9, NONE_R = 1e9;

// curve strengths (screen drift per segment; the centrifugal pull scales with it)
const EASY = 1.6, MED = 3.0, HARD = 4.4;

class Builder {
    constructor(y, centre, ter) {
        this.segs = []; this.lastY = y; this.c = centre; this.ter = ter;
        this.seaL = NONE_L; this.seaR = NONE_R;
    }

    add(curve, yEnd) {
        const s = {
            i: 0, z: 0, y: this.lastY, curve,
            r0: this.c, r1: this.c, n: 1, gh: -1,
            ter: this.ter, terR: this.ter, split: NaN,
            seaL: this.seaL, seaR: this.seaR,
            band: 0, line: 0, mark: Mark.None, sprites: [], stage: 0,
        };
        this.lastY = yEnd;
        this.segs.push(s);
        return s;
    }

    road(enter, hold, leave, curve = 0, dy = 0) {
        const y0 = this.lastY, y1 = y0 + dy, total = enter + hold + leave;
        for (let n = 0; n < enter; n++) this.add(E.easeIn(0, curve, n / enter), E.easeInOut(y0, y1, (n + 1) / total));
        for (let n = 0; n < hold; n++) this.add(curve, E.easeInOut(y0, y1, (enter + n + 1) / total));
        for (let n = 0; n < leave; n++) this.add(E.easeInOut(curve, 0, n / leave), E.easeInOut(y0, y1, (enter + hold + n + 1) / total));
    }

    straight(n, dy = 0) { this.road(0, n, 0, 0, dy); }
}

// ------------------------------------------------------------------ the stages
function stage1(b) {
    b.seaL = b.c - 3.4;
    b.straight(70);                                  // the grid, the gantry at 14
    b.road(40, 90, 40, EASY, 0);
    b.road(30, 50, 30, 0, 1100);
    b.road(40, 110, 40, -MED, -1100);                // sweeping left along the water
    b.straight(40);
    b.road(30, 70, 30, MED, 0);
    b.road(30, 70, 30, -MED, 0);                     // an S
    b.road(40, 60, 40, 0, 2600);                     // the big crest ...
    b.road(20, 20, 30, 0, -2600);                    // ... and over it
    b.road(40, 120, 40, -EASY, 0);
    b.road(30, 60, 30, HARD, 0);                     // the hairpin-ish right
    b.straight(30);
    b.road(30, 80, 30, -MED, 800);
    b.road(30, 80, 30, EASY, -800);
    b.road(40, 90, 40, -HARD, 0);                    // the hard left before the checkpoint
    b.straight(80);                                  // checkpoint at the end
}

function stageCanyon(b) {
    b.straight(40);
    b.road(30, 60, 30, -MED, 0);
    b.road(20, 50, 20, HARD, 700);
    b.road(20, 50, 20, -HARD, -700);
    b.road(30, 70, 30, MED, 0);
    b.straight(30);
    b.road(30, 60, 30, -HARD, 1500);
    b.road(30, 60, 30, MED, -1500);
    b.road(40, 90, 40, -EASY, 0);
    b.road(20, 60, 20, HARD, 0);
    b.road(20, 60, 20, -HARD, 0);
    b.road(30, 80, 30, MED, 1000);
    b.road(30, 80, 30, 0, -1000);
    b.road(30, 70, 30, -MED, 0);
    b.straight(80);
}

function stageHills(b) {
    b.straight(40);
    b.road(40, 70, 40, 0, 2600);                     // a blind crest
    b.road(30, 30, 40, 0, -2600);
    b.road(40, 110, 40, EASY, 0);
    b.road(40, 60, 40, 0, 3000);
    b.road(30, 60, 30, -EASY, -3000);
    b.road(40, 90, 40, MED, 1600);
    b.road(40, 90, 40, -MED, -1600);
    b.road(40, 60, 40, 0, 2200);
    b.road(20, 30, 30, 0, -2200);
    b.road(40, 110, 40, -EASY, 0);
    b.road(30, 60, 30, MED, 0);
    b.straight(80);
}

function stageBay(b) {
    b.straight(50);
    b.road(40, 130, 40, EASY, 0);
    b.road(30, 70, 30, -MED, 1000);
    b.road(30, 70, 30, MED, -1000);
    b.road(40, 110, 40, EASY, 0);
    b.road(30, 60, 30, -HARD, 0);
    b.road(30, 60, 30, HARD, 0);
    b.road(40, 90, 40, -EASY, 700);
    b.road(40, 90, 40, EASY, -700);
    b.straight(220);                                 // the last straight into the GOAL
}

// ------------------------------------------------------------------ decoration
function sp(seg, kindName, x, flip = false) {
    const k = KIND[kindName];
    if (!k) throw new Error('sunsetdrive course: no sprite kind ' + kindName);
    seg.sprites.push({ k: k.id, x, flip });
}

function chevrons(segs, from, to, c) {
    for (let i = from; i < to; i++) {
        const s = segs[i];
        if (Math.abs(s.curve) >= 2.4 && i % 6 === 0) {
            // on the outside of the bend, pointing into it
            const right = s.curve > 0;
            sp(s, right ? 'chevR' : 'chevL', (right ? -1 : 1) * 1.62 + c(s));
            s._chev = true;
        }
    }
}

function decorateCoast(segs, from, to, rng) {
    const c = s => s.r0;
    chevrons(segs, from, to, c);
    const palms = ['palm', 'palm2', 'palm3'];
    let board = 0;
    for (let i = from; i < to; i++) {
        const s = segs[i], k = i - from;
        if (k < 40) continue;                            // the grid stays clear
        if (k % 9 === 0 && !s._chev) sp(s, palms[(k / 9) % 3 | 0], c(s) - 1.75 - rng.nextDouble() * 1.0, rng.nextDouble() < 0.5);
        if (k % 13 === 5 && !s._chev) sp(s, palms[(k / 13 + 1) % 3 | 0], c(s) + 1.75 + rng.nextDouble() * 0.8, rng.nextDouble() < 0.5);
        if (k % 29 === 17) sp(s, 'stone', c(s) - 2.3 - rng.nextDouble() * 0.5);
        if (k % 97 === 40) sp(s, 'hut', c(s) + 2.9);
        if (k % 173 === 90) sp(s, 'tower', c(s) - 2.7);
        if (k % 71 === 33 && !s._chev) { sp(s, 'board' + (board++ % 4), c(s) + 2.0); }
        if (k % 43 === 21) sp(s, 'bush', c(s) + 2.4 + rng.nextDouble());
    }
}

function decorateCanyon(segs, from, to, rng, c) {
    chevrons(segs, from, to, c);
    for (let i = from; i < to; i++) {
        const s = segs[i], k = i - from;
        if (k % 7 === 0 && !s._chev) sp(s, rng.nextDouble() < 0.5 ? 'rock' : 'rock2', c(s) + (k % 14 === 0 ? -1 : 1) * (1.95 + rng.nextDouble() * 1.0), rng.nextDouble() < 0.5);
        if (k % 17 === 3) sp(s, 'spire', c(s) + (k % 34 === 3 ? 1 : -1) * (2.6 + rng.nextDouble() * 1.4), rng.nextDouble() < 0.5);
        if (k % 11 === 6 && !s._chev) sp(s, 'cactus', c(s) + (k % 22 === 6 ? 1 : -1) * (1.8 + rng.nextDouble() * 0.9));
        if (k % 131 === 60 && !s._chev) sp(s, rng.nextDouble() < 0.5 ? 'board0' : 'board3', c(s) - 2.1);
    }
}

function decorateHills(segs, from, to, rng, c) {
    chevrons(segs, from, to, c);
    for (let i = from; i < to; i++) {
        const s = segs[i], k = i - from;
        const alley = (Math.floor(k / 120) % 2) === 0;          // stretches of cypress alley, then open fields
        if (alley && k % 5 === 0 && !s._chev) { sp(s, 'cypress', c(s) - 1.72); sp(s, 'cypress', c(s) + 1.72); }
        if (!alley && k % 9 === 0 && !s._chev) sp(s, 'bush', c(s) + (k % 18 === 0 ? 1 : -1) * (1.7 + rng.nextDouble() * 1.2));
        if (!alley && k % 13 === 4) sp(s, 'cypress', c(s) + (k % 26 === 4 ? -1 : 1) * (2.3 + rng.nextDouble() * 1.5));
        if (k % 67 === 30) sp(s, 'house', c(s) + (k % 134 === 30 ? 1 : -1) * 3.2);
        if (k % 151 === 75 && !s._chev) sp(s, rng.nextDouble() < 0.5 ? 'board1' : 'board2', c(s) + 2.1);
    }
}

function decorateBay(segs, from, to, rng, c, goalAt) {
    chevrons(segs, from, to, c);
    const palms = ['palm', 'palm2', 'palm3'];
    for (let i = from; i < to; i++) {
        const s = segs[i], k = i - from;
        const final = i >= goalAt - 180;
        if (final) {
            if (k % 6 === 0) { sp(s, 'flag', c(s) - 1.38); sp(s, 'flag', c(s) + 1.38, true); }
            if (k % 12 === 3) { sp(s, palms[k % 3], c(s) - 2.2); sp(s, palms[(k + 1) % 3], c(s) + 2.2, true); }
            continue;
        }
        if (k % 20 === 0 && !s._chev) { sp(s, 'lamp', c(s) - 1.32); sp(s, 'lampL', c(s) + 1.32); }
        if (k % 10 === 5 && !s._chev) sp(s, palms[(k / 10) % 3 | 0], c(s) + (k % 20 === 5 ? 1 : -1) * (1.8 + rng.nextDouble() * 0.5), rng.nextDouble() < 0.5);
        if (k % 83 === 40) sp(s, 'motel', c(s) - 2.7);
        if (k % 61 === 20 && !s._chev) sp(s, k % 122 === 20 ? 'board4' : 'board1', c(s) - 2.2);
        if (k % 47 === 12) sp(s, 'board5', c(s) + 2.3);
    }
}

// an arch across the road at segment s (with the posts that collide)
function archAt(s, kindName, c) {
    sp(s, kindName, c);
    sp(s, 'post', c - 1.34); sp(s, 'post', c + 1.34);
}

// ------------------------------------------------------------------ the fork
const TIP_WIDEN = 44;         // segments over which one road becomes two touching roads
const F_TIP = 2.7;            // separation at the tip (a 0.7 half-width median)
const POST = 196;             // tip to fork end (more than DRAW: the branch is never seen before the choice)
const F_END = 22;
const GHOST = 130;            // the route not taken keeps leaving for this many segments
const F_GHOST = 70;

function forkZone(b) {
    const mid = b.c, start = b.segs.length;
    // widen
    for (let k = 0; k < TIP_WIDEN; k++) {
        const s = b.add(0, b.lastY);
        const f = E.easeInOut(0, F_TIP, (k + 1) / TIP_WIDEN);
        s.r0 = mid - f / 2; s.r1 = mid + f / 2; s.n = 2;
    }
    const tip = b.segs.length;
    // apart (a gentle rise and fall so the two roads roll away over the land)
    const y0 = b.lastY;
    for (let k = 0; k < POST; k++) {
        const t = (k + 1) / POST;
        const s = b.add(0, y0 + Math.sin(t * Math.PI) * 900);
        const f = F_TIP + (F_END - F_TIP) * t * t;
        s.r0 = mid - f / 2; s.r1 = mid + f / 2; s.n = 2;
    }
    const segs = b.segs;
    // ground: coast sand gives way to canyon (left) and grass (right) from the fork start
    for (let i = start; i < segs.length; i++) {
        const s = segs[i];
        s.ter = Ter.Canyon; s.terR = Ter.Hills; s.split = mid;
        s.seaL = NONE_L;
    }
    // the sea drifts away before the fork
    for (let i = start - 70; i < start; i++) segs[i].seaL = mid - 3.4 - Math.pow((i - (start - 70)) / 70, 2) * 14;
    return { start, tip, end: segs.length, mid };
}

function decorateFork(segs, fz, rng) {
    const { start, tip, end, mid } = fz;
    sp(segs[tip], 'fork', mid);
    // the median: shrubs and chevrons pointing both ways right behind the tip, then bushes
    for (let i = tip + 3; i < end; i++) {
        const s = segs[i], k = i - tip;
        const m = (s.r0 + s.r1) / 2, f = s.r1 - s.r0;
        if (k < 30 && k % 5 === 3) { sp(s, 'chevL', m - 0.12); sp(s, 'chevR', m + 0.12); }
        else if (k % 6 === 0 && f < 12) sp(s, 'bush', m + (rng.nextDouble() - 0.5) * Math.max(0, f - 3));
        // the outer sides: canyon on the left road, cypress on the right road
        if (k % 8 === 0) sp(s, rng.nextDouble() < 0.5 ? 'rock' : 'cactus', s.r0 - 1.9 - rng.nextDouble());
        if (k % 8 === 4) sp(s, 'cypress', s.r1 + 1.75 + rng.nextDouble() * 0.6);
        if (k % 8 === 2 && f > 6) sp(s, 'cypress', s.r0 + 1.7);
        if (k % 8 === 6 && f > 6) sp(s, 'rock2', s.r1 - 1.8);
    }
    // before the tip: billboards announce it
    sp(segs[start - 30], 'board3', mid + 2.0);
    sp(segs[start + 10], 'chevL', mid - 1.9); sp(segs[start + 10], 'chevR', mid + 1.9);
}

// ------------------------------------------------------------------ assembling a track
function finish(segs) {
    for (let i = 0; i < segs.length; i++) {
        const s = segs[i];
        s.i = i; s.z = i * SEG; s.band = Math.floor(i / RUMBLE) & 1;
    }
    return segs;
}

function buildBranch(prefixEnd, side, rng) {
    // side -1: CANYON RUN (the left road), +1: VISTA HILLS (the right road)
    const mid = prefixEnd.mid, c = mid + side * F_END / 2;
    const b = new Builder(prefixEnd.y, c, side < 0 ? Ter.Canyon : Ter.Hills);
    if (side < 0) stageCanyon(b); else stageHills(b);
    const branchLen = b.segs.length;
    // the route not taken: the other road keeps leaving for GHOST segments
    for (let k = 0; k < GHOST && k < branchLen; k++) {
        const s = b.segs[k], t = (k + 1) / GHOST;
        const f = F_END + (F_GHOST - F_END) * t * t;
        const other = mid - side * f / 2;
        s.n = 2;
        if (side < 0) { s.r0 = c; s.r1 = other; s.gh = 1; } else { s.r0 = other; s.r1 = c; s.gh = 0; }
        s.split = (c + other) / 2; s.ter = side < 0 ? Ter.Canyon : Ter.Hills; s.terR = side < 0 ? Ter.Hills : Ter.Canyon;
        if (side > 0) { s.ter = Ter.Canyon; s.terR = Ter.Hills; }
    }
    const cfn = s => (side < 0 ? s.r0 : s.r1);
    if (side < 0) decorateCanyon(b.segs, 0, branchLen - 4, rng, cfn); else decorateHills(b.segs, 0, branchLen - 4, rng, cfn);
    const cp = branchLen - 2;
    b.segs[cp].line = 2; b.segs[cp].mark = Mark.Checkpoint;
    archAt(b.segs[cp], 'cp', c);
    // stage 3 continues from the same centre and height
    const b3 = new Builder(b.lastY, c, Ter.Bay);
    b3.seaR = NONE_R;
    stageBay(b3);
    const n3 = b3.segs.length;
    // the sea comes in on the right over the first 80 segments
    for (let k = 0; k < n3; k++) b3.segs[k].seaR = c + 3.4 + (k < 80 ? Math.pow(1 - k / 80, 2) * 16 : 0);
    const goalAt = n3 - 20;
    decorateBay(b3.segs, 0, goalAt - 2, rng, s => s.r0, goalAt);
    b3.segs[goalAt].line = 1; b3.segs[goalAt].mark = Mark.Goal;
    archAt(b3.segs[goalAt], 'goal', c);
    // runoff past the goal (the car rolls to a stop here)
    for (let k = 0; k < 260; k++) { const s = b3.add(0, b3.lastY); if (k % 8 === 0) { sp(s, 'flag', c - 1.4); sp(s, 'flag', c + 1.4, true); } }
    return { branch: b.segs, bay: b3.segs, cpIndex: cp, goalIndex: goalAt, centre: c };
}

function buildCourse() {
    const rng = new SystemRandom(1987);
    // the shared prefix: stage 1 and the fork
    const b = new Builder(0, 0, Ter.Coast);
    stage1(b);
    const s1len = b.segs.length;
    decorateCoast(b.segs, 0, s1len - 4, rng);
    // the start: the gantry (drawn lit by the countdown) and a checkered line
    b.segs[30].line = 1; b.segs[30].mark = Mark.Start; archAt(b.segs[30], 'gantry0', 0);
    for (let i = 6; i < 40; i += 5) { sp(b.segs[i], 'flag', -1.42); sp(b.segs[i], 'flag', 1.42, true); }
    const cp1 = s1len - 3;
    b.segs[cp1].line = 2; b.segs[cp1].mark = Mark.Checkpoint; archAt(b.segs[cp1], 'cp', 0);
    b.straight(150);                                 // the run-up to the fork (CHOOSE YOUR ROAD)
    const fz = forkZone(b);
    b.segs[fz.tip].mark = Mark.ForkTip;
    decorateFork(b.segs, fz, rng);
    for (const s of b.segs) s.stage = 0;
    const prefix = b.segs;
    const prefixEnd = { mid: fz.mid, y: b.lastY };

    const tracks = {};
    for (const side of [-1, 1]) {
        const br = buildBranch(prefixEnd, side, new SystemRandom(side < 0 ? 77 : 88));
        for (const s of br.branch) s.stage = 1;
        for (const s of br.bay) s.stage = 2;
        const segs = finish([...prefix, ...br.branch, ...br.bay]);
        const P = prefix.length;
        tracks[side] = {
            side, segs,
            mainIdx: side < 0 ? 0 : 1,
            cp1Z: cp1 * SEG, tipZ: fz.tip * SEG, forkStartZ: fz.start * SEG, forkEndZ: fz.end * SEG,
            cp2Z: (P + br.cpIndex) * SEG, goalZ: (P + br.branch.length + br.goalIndex) * SEG,
            stageName: [TER_NAMES[Ter.Coast], side < 0 ? TER_NAMES[Ter.Canyon] : TER_NAMES[Ter.Hills], TER_NAMES[Ter.Bay]],
            stageTer: [Ter.Coast, side < 0 ? Ter.Canyon : Ter.Hills, Ter.Bay],
        };
    }
    // the prefix segments are shared: finish() gave them the same i and z in both tracks
    return { tracks, prefixLen: prefix.length, tipIndex: fz.tip, startIndex: 30 };
}

export const Course = buildCourse();

// ------------------------------------------------------------------ queries (plain functions: the sim and the renderer share them)
export function segAt(track, z) {
    let i = Math.floor(z / SEG);
    if (i < 0) i = 0;
    const segs = track.segs;
    if (i >= segs.length - 1) i = segs.length - 2;
    return segs[i];
}

// the centre of road k at z (interpolated inside the segment)
export function roadAt(track, k, z) {
    const s = segAt(track, z), n = track.segs[s.i + 1];
    const t = Math.min(1, Math.max(0, (z - s.z) / SEG));
    const a = k === 0 ? s.r0 : s.r1, b = k === 0 ? n.r0 : n.r1;
    return a + (b - a) * t;
}

export function heightAt(track, z) {
    const s = segAt(track, z), n = track.segs[s.i + 1];
    const t = Math.min(1, Math.max(0, (z - s.z) / SEG));
    return s.y + (n.y - s.y) * t;
}
