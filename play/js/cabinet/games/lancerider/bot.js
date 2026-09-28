// THE NODE · world 1 · LANCE RIDER on the Cabinet Engine · THE BOT: a modelled average player.
// Port of LanceRiderBot.cs.
//
// It plays through the control panel like anyone else: the stick (left / right / nothing) and
// button A, one flap per PRESS (it lets go between presses). It reads the round but never writes
// to it, and rolls only its own dice (CabinetBotBase.rng).
//
//   THE PLAN (the brief's two rules):
//     1. pick the nearest rival and CLIMB STRICTLY ABOVE ITS ALTITUDE before committing to a
//        collision course: until it is climbMargin px higher it holds off (drifts away if close)
//        and flaps up; once above, it steers in to meet the rival, staying a little higher.
//     2. go for the nearest EGG whenever no rival is within 3 tiles (48 px).
//   THE AVERAGE PLAYER in it:
//     react     0.22 s   between decisions (x0.8..1.3), acting on what it saw then
//     misjudge  6 px     altitude read error per decision (commits when it only thinks it is above)
//     sloppy    0.06     chance per decision to commit anyway (impatience)
//     wary      0.8      chance per decision it notices a rival above it within 56 px and runs from
//                        under it (sideways, dropping if it is right overhead; it never climbs into it)
//     breather  0.5-1.5 s  after every score it hovers and takes stock
//     flapRate  5 /s     how fast it can flap; mashRate 6.5 /s when the hand has it
//     panic     30 px    height over a pit at which it flaps to save itself, but only if it notices
//                        (notice 0.85 per decision)
// intent (egg / commit / climb / flee / breather / idle) is exposed for the Lab's diagnostics only.
import { CabinetBotBase, InputFrame } from '../../sdk/index.js';
import { RiderMode, Phase, wrapDx, overBase, LAVA_Y, CEILING_FEET } from './round.js';

export class LanceRiderBot extends CabinetBotBase {
    constructor() {
        super();
        this.react = 0.22;
        this.climbMargin = 10;
        this.misjudge = 6;
        this.sloppy = 0.06;
        this.flapRate = 5.0;
        this.mashRate = 6.5;
        this.panicHeight = 30;
        this.notice = 0.85;
        this.eggRadius = 48;             // 3 tiles of 16 px
        this.wary = 0.8;                 // chance per decision it notices a rival above it, close, and flees
        this.waryRange = 56;
        this.breatherMin = 0.5; this.breatherMax = 1.5;   // after a score it takes stock (hovers)

        this.thinkLeft = 0; this.flapLeft = 0; this.err = 0; this.wantH = 80; this.stick = 0; this.lastScore = 0;
        this.watchLava = true; this.breather = 0;

        // what it is doing (for the Lab's diagnostics only): egg, commit, climb, flee, breather, idle
        this.intent = 'idle';
    }

    get name() { return 'lr-average-player'; }

    reset(seed) {
        super.reset(seed);
        this.thinkLeft = 0; this.flapLeft = 0; this.err = 0; this.wantH = 80; this.stick = 0;
        this.watchLava = true; this.breather = 0; this.lastScore = 0;
    }

    think(sim, dt) {
        const s = sim;
        if (s == null || s.p !== Phase.Playing) { this.thinkLeft = 0; return InputFrame.neutral; }
        const p = s.player;
        this.flapLeft -= dt;
        this.thinkLeft -= dt;

        if (p.mode === RiderMode.Grabbed) {
            // the hand: mash the flap button
            if (this.flapLeft <= 0 && !this.lastFrame.a) { this.flapLeft = 1 / this.mashRate * this.range(0.8, 1.25); return new InputFrame(0, 0, true); }
            return InputFrame.neutral;
        }
        if (p.mode !== RiderMode.Flying && p.mode !== RiderMode.Spawning) return InputFrame.neutral;

        if (s.score !== this.lastScore) { this.lastScore = s.score; this.breather = this.range(this.breatherMin, this.breatherMax); }
        this.breather -= dt;
        if (this.thinkLeft <= 0) this._decide(s, p);

        const f = new InputFrame(this.stick, 0, false);
        const hgt = p.height;
        const up = hgt < this.wantH + this.err && p.vy > -90;
        const panic = this.watchLava && !p.grounded && hgt < this.panicHeight && p.vy > -40 && !overBase(p.x);
        if ((up || panic) && this.flapLeft <= 0 && !this.lastFrame.a) {
            f.a = true;
            this.flapLeft = 1 / this.flapRate * this.range(0.85, 1.25);
        }
        return f;
    }

    _decide(s, p) {
        this.thinkLeft = this.react * this.range(0.8, 1.3);
        this.err = this.range(-this.misjudge, this.misjudge);
        this.watchLava = this.chance(this.notice);

        // the nearest rival that can be jousted (spawning riders are not yet solid)
        let target = null, best = 1e9;
        for (const r of s.rivals) {
            if (r.mode !== RiderMode.Flying && r.mode !== RiderMode.Hatchling) continue;
            const dx = wrapDx(r.x - p.x), dy = r.y - p.y;
            const d = Math.sqrt(dx * dx + dy * dy);
            if (d < best) { best = d; target = r; }
        }
        let egg = null, eb = 1e9;
        for (const e of s.eggs) {
            if (!e.alive) continue;
            const dx = wrapDx(e.x - p.x), dy = e.y - p.y;
            const d = Math.sqrt(dx * dx + dy * dy);
            if (d < eb) { eb = d; egg = e; }
        }

        const ceiling = LAVA_Y - CEILING_FEET - 4;

        // a rival above and close: get out of its way (if it is noticed)
        let threat = null, tb = this.waryRange;
        for (const r of s.rivals) {
            if (r.mode !== RiderMode.Flying) continue;
            const dx = wrapDx(r.x - p.x), dy = p.y - r.y;       // dy > 0: it is higher
            const d = Math.sqrt(dx * dx + dy * dy);
            if (dy > 3 && d < tb) { tb = d; threat = r; }
        }
        if (threat != null && this.chance(this.wary)) {
            const dx = wrapDx(threat.x - p.x);
            // get out from under it: run away and let it pass over (never climb into it)
            this.intent = 'flee';
            this.stick = dx > 0 ? -1 : 1;
            this.wantH = Math.abs(dx) < 24 ? Math.max(this.panicHeight + 6, p.height - 24) : p.height;
            if (this.wantH > ceiling) this.wantH = ceiling;
            return;
        }
        if (this.breather > 0) {
            // taking stock after a score: hold height, drift
            this.intent = 'breather';
            this.wantH = Math.max(60, Math.min(ceiling, p.height));
            this.stick = 0;
            return;
        }

        if (egg != null && (target == null || best > this.eggRadius)) {
            // the egg: cruise a little above its ledge, then drop onto it and run in
            this.intent = 'egg';
            const dx = wrapDx(egg.x - p.x);
            const eggH = LAVA_Y - egg.y;
            const eggFalling = !egg.grounded;
            if (eggFalling) this.wantH = eggH;                                   // meet it in the air
            else if (Math.abs(dx) > 16 || p.height < eggH - 2) this.wantH = eggH + 16;
            else this.wantH = eggH - 6;                                          // let go: land beside it
            this.stick = dx > 3 ? 1 : dx < -3 ? -1 : 0;
        } else if (target != null) {
            const dx = wrapDx(target.x - p.x);
            const above = target.y - p.y;                                       // px the player is higher
            let thinksAbove = above + this.err > this.climbMargin || this.chance(this.sloppy);
            if (target.mode === RiderMode.Hatchling) thinksAbove = true;         // on foot: just ride it down
            if (thinksAbove) {
                // committed: on a collision course, a little higher than the rival
                this.intent = 'commit';
                const lead = dx + target.vx * 0.2;
                this.stick = lead > 2 ? 1 : lead < -2 ? -1 : 0;
                this.wantH = target.height + this.climbMargin * 0.6;
            } else {
                // not above yet: climb, and do not close in while climbing
                this.intent = 'climb';
                this.wantH = target.height + this.climbMargin + 14;
                this.stick = Math.abs(dx) < 56 ? (dx > 0 ? -1 : 1) : 0;
            }
        } else {
            this.intent = 'idle';
            this.wantH = 90;
            this.stick = 0;
        }
        if (this.wantH > ceiling) this.wantH = ceiling;
    }
}
