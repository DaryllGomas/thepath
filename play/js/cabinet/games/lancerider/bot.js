// THE NODE · world 1 · LANCE RIDER on the Cabinet Engine · THE BOT: a modelled average player.
// Began as the port of LanceRiderBot.cs; built out 2026-10-18 to ride all seven waves.
//
// It plays through the control panel like anyone else: the stick (left / right / nothing) and
// button A, one flap per PRESS (it lets go between presses). It reads the round but never writes
// to it, and rolls only its own dice (CabinetBotBase.rng).
//
//   THE PLAN (the brief's two rules, then what the later waves add):
//     1. pick the nearest rival and CLIMB STRICTLY ABOVE ITS ALTITUDE before committing to a
//        collision course: until it is climbMargin px higher it holds off (drifts away if close)
//        and flaps up; once above, it steers in to meet the rival, staying a little higher.
//     2. go for the nearest EGG whenever no rival is within 3 tiles (48 px) (THE CLUTCH: the egg
//        that will hatch first, wherever the riders are, while none is close).
//     3. THE HAND: when the lava boils under it, climb. FALLING STONE: off a cracking ledge.
//     4. THE HAWK: when the chevrons show at its height, get 20 px out of its lane once it has
//        locked (or, now and then, the brave try: hold level and meet it head-on).
//     5. THE BEAST: keep out of the line of its jaws when it draws breath, out from under the
//        embers, out of the boil where it is coming up; when it is up, hover over its crown and
//        drop onto it.
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
//     dodge     0.85     chance per decision it reads a hazard (the hawk's lane, the jet, an ember)
//     brave     0.2      chance it tries to lance the hawk instead of dodging it
// intent (egg / commit / climb / flee / breather / dodge / strike / idle) is for the Lab's diagnostics only.
import { CabinetBotBase, InputFrame } from '../../sdk/index.js';
import { RiderMode, Phase, HandState, HawkState, wrapDx, LAVA_Y, CEILING_FEET } from './round.js';
import { BeastState, BeastAttack, AtkStage, BEAST_RISE } from './beast.js';

export class LanceRiderBot extends CabinetBotBase {
    constructor() {
        super();
        this.react = 0.22;
        this.climbMargin = 10;
        this.misjudge = 3;
        this.sloppy = 0.02;
        this.flapRate = 5.0;
        this.mashRate = 6.5;
        this.panicHeight = 30;
        this.notice = 0.95;
        this.eggRadius = 48;             // 3 tiles of 16 px
        this.wary = 0.95;                // chance per decision it notices a rival above it, close, and flees
        this.waryRange = 56;
        this.breatherMin = 0.5; this.breatherMax = 1.5;   // after a score it takes stock (hovers)
        this.dodge = 0.85;
        this.brave = 0.2;

        this.thinkLeft = 0; this.flapLeft = 0; this.err = 0; this.wantH = 80; this.stick = 0; this.lastScore = 0;
        this.watchLava = true; this.breather = 0; this.hawkPlan = 0; this.hawkSeen = -1;

        // what it is doing (for the Lab's diagnostics only)
        this.intent = 'idle';
    }

    get name() { return 'lr-average-player'; }

    reset(seed) {
        super.reset(seed);
        this.thinkLeft = 0; this.flapLeft = 0; this.err = 0; this.wantH = 80; this.stick = 0;
        this.watchLava = true; this.breather = 0; this.lastScore = 0; this.hawkPlan = 0; this.hawkSeen = -1;
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
        const panic = this.watchLava && !p.grounded && hgt < this.panicHeight && p.vy > -40 && !s.overBase(p.x);
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
        const ceiling = LAVA_Y - CEILING_FEET - 4;

        if (this._hazards(s, p, ceiling)) { if (this.wantH > ceiling) this.wantH = ceiling; return; }

        // the nearest rival that can be jousted (spawning riders are not yet solid)
        let target = null, best = 1e9;
        for (const r of s.rivals) {
            if (r.mode !== RiderMode.Flying && r.mode !== RiderMode.Hatchling) continue;
            const dx = wrapDx(r.x - p.x), dy = r.y - p.y;
            const d = Math.sqrt(dx * dx + dy * dy);
            if (d < best) { best = d; target = r; }
        }
        let egg = null, eb = 1e9;
        const clutch = !!s.stage.eggs;
        for (const e of s.eggs) {
            if (!e.alive) continue;
            const dx = wrapDx(e.x - p.x), dy = e.y - p.y;
            // THE CLUTCH: the egg nearest to hatching counts as nearer
            const d = Math.sqrt(dx * dx + dy * dy) + (clutch && e.grounded ? (e.hatchAt - e.age) * 12 : 0);
            if (d < eb) { eb = d; egg = e; }
        }

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

        // the beast is up: its crown first (a rider right on top of us still comes first)
        const b = s.beast;
        if (b != null && this._strike(s, p, b, target, best)) { if (this.wantH > ceiling) this.wantH = ceiling; return; }

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
            this.wantH = b != null ? BEAST_RISE + 30 : 90;
            this.stick = 0;
            if (b != null) { const dx = wrapDx(b.x - p.x); this.stick = Math.abs(dx) > 30 ? (dx > 0 ? 1 : -1) : 0; }
        }
        if (this.wantH > ceiling) this.wantH = ceiling;
        if (!s.overBase(p.x) && this.wantH < 44) this.wantH = 44;          // never follow a rival down into the lava
    }

    // the things that come before any joust: the hawk, the hand, falling stone, the beast's fire.
    // Returns true when one of them decided this turn.
    _hazards(s, p, ceiling) {
        // ---- the cinder hawk
        const hk = s.hawk;
        if ((hk.state === HawkState.Warn || hk.state === HawkState.Pass) && this.chance(this.dodge)) {
            const pass = hk.passes + (hk.state === HawkState.Warn ? 1 : 0);
            if (this.hawkSeen !== pass) { this.hawkSeen = pass; this.hawkPlan = this.chance(this.brave) ? 1 : 0; }
            const locked = hk.state === HawkState.Pass || hk.t >= s.hawkWarn - s.hawkLock;
            const dy = p.y - hk.y;
            const coming = hk.state === HawkState.Warn || (hk.dir > 0 ? hk.x < p.x + 20 : hk.x > p.x - 20);
            if (coming && locked && this.hawkPlan === 1 && Math.abs(dy) < 8) {
                // the brave try: level with its beak, facing it
                this.intent = 'lance';
                this.wantH = LAVA_Y - hk.y;
                this.stick = -hk.dir;
                return true;
            }
            if (coming && locked && Math.abs(dy) < 22) {
                this.intent = 'dodge';
                // out of its lane: drop under it (gravity is quicker than wings), unless that is the lava
                const below = (LAVA_Y - hk.y) - 30;
                this.wantH = below > this.panicHeight + 12 ? below : (LAVA_Y - hk.y) + 30;
                this.stick = 0;
                return true;
            }
        }
        // ---- the hand boils under me
        if (s.hand === HandState.Warn && s.handVictim === p) {
            this.intent = 'dodge';
            this.wantH = Math.max(p.height + 30, 70);
            return true;
        }
        // ---- the stone under me is cracking
        if (p.grounded) {
            for (const L of s.ledges) if (!L.gone && L.crack > 0 && Math.abs(p.y - L.top) < 1 && s.onLedgeX(L, p.x, 5)) {
                this.intent = 'dodge';
                this.wantH = p.height + 30;
                return true;
            }
        }
        // ---- the beast's fire, the boil where it is coming up
        const b = s.beast;
        if (b == null || !this.chance(this.dodge)) return false;
        const pb = wrapDx(p.x - b.x);
        for (const e of b.embers) {
            const ex = wrapDx(e.x + e.vx * 0.3 - p.x), ey = e.y + e.vy * 0.3 + 130 * 0.09 - (p.y - 7);
            if (Math.abs(ex) < 24 && Math.abs(ey) < 30) {
                this.intent = 'dodge';
                this.stick = Math.abs(pb) < 60 ? (pb >= 0 ? 1 : -1) : ex > 0 ? -1 : 1;    // away from the ember, never into its head
                this.wantH = p.height;
                return true;
            }
        }
        if ((b.attack === BeastAttack.Spit && b.atkStage !== AtkStage.Idle) || b.embers.some(e => e.vy < 0)) {
            // it is spitting: stand off to the side until the embers come down
            const onTop = Math.abs(pb) < 16 && p.y < b.crownY - 4 && b.solid;
            if (Math.abs(pb) < 80 && !onTop) {
                this.intent = 'dodge';
                this.stick = pb >= 0 ? 1 : -1;
                this.wantH = Math.max(70, p.height);
                return true;
            }
        }
        if (b.attack === BeastAttack.Breath && (b.atkStage === AtkStage.Tele || b.atkStage === AtkStage.Fire)) {
            const rel = pb * b.facing, my = b.mouthY;
            if (rel > 0 && rel < 150 && p.y > my - 14 && p.y - 14 < my + 14) {
                this.intent = 'dodge';
                this.wantH = (LAVA_Y - my) + 26;          // over the jet
                this.stick = rel < 40 ? (b.facing > 0 ? 1 : -1) : 0;
                return true;
            }
        }
        if (b.state === BeastState.Warn && Math.abs(pb) < 34 && p.height < BEAST_RISE + 20) {
            this.intent = 'dodge';
            this.stick = pb >= 0 ? 1 : -1;
            this.wantH = BEAST_RISE + 30;
            return true;
        }
        if (b.solid && b.state !== BeastState.Hurt) {
            // never sit level with its head or below it, close
            const rel = pb * b.facing;
            if (rel > -26 && rel < 34 && p.y > b.crownY + 4) {
                this.intent = 'dodge';
                this.stick = pb >= 0 ? 1 : -1;
                this.wantH = (LAVA_Y - b.crownY) + 24;
                return true;
            }
        }
        return false;
    }

    // over the crown, then drop onto it
    _strike(s, p, b, target, best) {
        if (!b.solid || b.state === BeastState.Hurt || b.rise < 0.9) return false;
        if (target != null && best < 40 && target.y < p.y) return false;
        this.intent = 'strike';
        const dx = wrapDx(b.x - p.x);
        const crownH = LAVA_Y - b.crownY;
        if (p.height < crownH + 10 && Math.abs(dx) < 46) {
            // below its crown and close: off to the side and up first, never in through its jaw
            this.wantH = crownH + 26;
            this.stick = dx > 0 ? -1 : 1;
            return true;
        }
        const jet = b.attack === BeastAttack.Breath && b.atkStage !== AtkStage.Idle;
        if (Math.abs(dx) <= 4 && p.height > crownH + 2 && !(jet && p.height < crownH + 10)) this.wantH = crownH - 12;   // let go: drop on it
        else this.wantH = crownH + 16;
        this.stick = dx > 2 ? 1 : dx < -2 ? -1 : 0;
        if (Math.abs(dx) <= 4 && Math.abs(p.vx) > 30) this.stick = p.vx > 0 ? -1 : 1;                    // brake over it
        return true;
    }
}
