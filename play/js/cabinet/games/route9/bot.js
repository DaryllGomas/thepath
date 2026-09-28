// THE NODE · world 1 · ROUTE 9 · THE BOT: a modelled average paperboy, playing through the panel.
// Port of Route9Bot.cs.
//
//   THROW  the instant a subscriber's mailbox column lines up with the bike's, give or take a
//          human's timing error (AimSigma px of route, worse while it is busy dodging). If the
//          paper misses and the bike is on lanes 0-2, it tries the porch the same way. Now and then
//          it puts one through a dark house's window when it has papers to spare.
//   STEER  toward the widest hazard-free lane ahead (look-ahead = Look s of riding). It notices a
//          hazard in time with chance Notice, otherwise only when it is LateSee px away. A dog on
//          its lawn is ignored until it runs. It picks up the bundle when it is short of papers.
//   SPEED  cruises; at a crossing it reads the cross traffic (misjudging it by TrafficSigma s) and
//          slows down or speeds up to cross between cars.
// Its dice are its own (this.rng); it reads the sim and never writes to it.
import { CabinetBotBase, InputFrame, Pad } from '../../sdk/index.js';
import { Route9Sim, HazardType, LotKind, LaneL, BikeHS, BikeHL, CarHS, CarHL, lotEnd, lotMailboxS, lotDoorS, lotWindowS, lotCarLaneS, lotBundleS } from './sim.js';

export class Route9Bot extends CabinetBotBase {
    constructor() {
        super();
        this.notice = 0.80; this.lateSee = 40; this.look = 1.6;
        this.aimSigma = 3.2; this.busyAimMul = 1.8; this.porchTry = 0.85; this.porchAimMul = 1.3;
        this.trafficSigma = 0.25; this.trafficBlind = 0.10;
        this.windowChance = 0.3; this.laneTapGap = 0.16;
        this.lanePref = [2, 4, 1, 0];

        this._seen = null;
        this._hazSeen = null;          // 0 not yet in view, 1 noticed, 2 missed it (until LateSee), per Hazards index
        this._stage = null;            // per lot: 0 waiting, 1 mailbox thrown, 2 porch thrown / done
        this._err = null;              // per lot: the timing error for the current attempt (px of route)
        this._vandal = null;           // per lot: going for a window
        this._pendingA = false;
        this._tapCd = 0; this._sinceSteer = 9;
        this._trafficLot = null; this._trafficErr = 0; this._trafficBlind = false;
        this._carL = new Float64Array(8); this._carId = new Int32Array(8);
        this._vandalNow = false;
    }

    get name() { return 'r9-average-paperboy'; }

    reset(seed) {
        super.reset(seed);
        this._seen = null; this._pendingA = false; this._tapCd = 0; this._sinceSteer = 9; this._trafficLot = null;
    }

    _bind(r) {
        this._seen = r;
        this._hazSeen = new Array(r.hazards.length).fill(0);
        this._stage = new Array(r.lots.length).fill(0);
        this._err = new Array(r.lots.length).fill(NaN);
        this._vandal = new Array(r.lots.length).fill(false);
        this._trafficLot = null;
    }

    think(sim, dt) {
        const r = sim;
        if (r == null) return InputFrame.neutral;
        if (r !== this._seen) this._bind(r);
        if (r.p !== Route9Sim.Phase.Riding) { this._pendingA = false; return InputFrame.neutral; }

        this._tapCd -= dt; this._sinceSteer += dt;
        const f = new InputFrame();

        // ---- what it has seen
        const look = r.speed * this.look + 30;
        for (let i = 0; i < r.hazards.length; i++) {
            const h = r.hazards[i];
            const d = h.s - r.bikeS;
            if (this._hazSeen[i] === 0 && d < look) this._hazSeen[i] = this.chance(this.notice) ? 1 : 2;
            if (this._hazSeen[i] === 2 && d < this.lateSee) this._hazSeen[i] = 1;
        }

        // ---- steering: the widest free lane
        let want = r.lane;
        let best = -Infinity;
        let bundleWanted = false;
        for (const l of r.lots)
            if (l.kind === LotKind.Bundle && !l.bundleTaken && r.papersLeft < r.papersFull && lotBundleS(l) - r.bikeS < look + 20 && lotBundleS(l) - r.bikeS > -6)
                bundleWanted = true;
        const porchPending = this._porchPending(r);
        for (let k = 0; k < 4; k++) {
            const free = this._freeRun(r, k, look);
            let score = free;
            if (k === r.lane) score += 6;
            score += this.lanePref[k];                              // a paperboy rides near the houses
            if (bundleWanted && k <= 1) score += look;
            if (porchPending && k <= 2) score += 5;
            if (this._vandalNow && k <= 1) score += 5;
            if (score > best) { best = score; want = k; }
        }
        if (want !== r.lane && this._tapCd <= 0) {
            f.x = want < r.lane ? -1 : 1;
            this._tapCd = this.laneTapGap; this._sinceSteer = 0;
        }

        // ---- speed: cross traffic
        f.y = this._trafficSpeed(r, look);

        // ---- throwing
        if (this._pendingA) { if (!this.lastFrame.a) { f.a = true; this._pendingA = false; } }
        else if (this._wantThrow(r)) {
            if (this.lastFrame.a) this._pendingA = true; else f.a = true;
        }
        return f;
    }

    // distance to the first known hazard blocking lane k (look if none)
    _freeRun(r, k, look) {
        const lx = LaneL[k];
        let run = look;
        for (let i = 0; i < r.hazards.length; i++) {
            if (this._hazSeen[i] !== 1) continue;
            const h = r.hazards[i];
            if (h.hit) continue;
            const d = h.s - h.hs - BikeHS - r.bikeS;
            if (h.s + h.hs + BikeHS < r.bikeS) continue;
            if (d > run) continue;
            let hl = h.l, half = h.hl;
            if (h.type === HazardType.Dog) {
                if (h.state === 0 || h.state >= 3) continue;
                if (h.state === 1) hl = h.targetL;
            } else if (h.type === HazardType.Mower) { half = h.hl + (h.maxL - h.minL) / 2; hl = (h.maxL + h.minL) / 2; }
            else if (h.type === HazardType.Pothole) half *= 1 - r.potholeMargin;
            if (Math.abs(lx - hl) < half + BikeHL + 3) run = Math.max(0, d);
        }
        return run;
    }

    _porchPending(r) {
        for (let i = 0; i < r.lots.length; i++) {
            const l = r.lots[i];
            if (l.kind === LotKind.House && l.subscriber && !l.delivered && !l.missed && this._stage[i] === 1 && r.bikeS < lotDoorS(l) + 6) return true;
        }
        return false;
    }

    _wantThrow(r) {
        this._vandalNow = false;
        if (r.papersLeft <= 0) return false;
        const busy = this._sinceSteer < 0.6;
        for (let i = 0; i < r.lots.length; i++) {
            const l = r.lots[i];
            if (l.kind !== LotKind.House) continue;
            if (lotEnd(l) < r.bikeS - 20) continue;
            if (l.s0 > r.bikeS + 40) break;
            if (l.subscriber) {
                if (l.delivered || l.missed) continue;
                if (this._stage[i] === 0) {
                    if (Number.isNaN(this._err[i]) && lotMailboxS(l) - r.bikeS < 30) this._err[i] = this._gauss() * this.aimSigma * (busy ? this.busyAimMul : 1);
                    if (!Number.isNaN(this._err[i]) && r.bikeS >= lotMailboxS(l) + this._err[i]) { this._stage[i] = 1; this._err[i] = NaN; return true; }
                    return false;
                }
                if (this._stage[i] === 1) {
                    // the mailbox paper missed: the porch, if the paper can reach it from here
                    if (r.bikeS > lotDoorS(l) + 10) { this._stage[i] = 2; continue; }
                    if (r.lane > 2 || this._inFlight(r, l)) return false;
                    if (Number.isNaN(this._err[i]) && lotDoorS(l) - r.bikeS < 30) {
                        if (!this.chance(this.porchTry)) { this._stage[i] = 2; continue; }        // didn't notice it missed
                        this._err[i] = this._gauss() * this.aimSigma * this.porchAimMul * (busy ? this.busyAimMul : 1);
                    }
                    if (!Number.isNaN(this._err[i]) && r.bikeS >= lotDoorS(l) + this._err[i]) { this._stage[i] = 2; this._err[i] = NaN; return true; }
                    return false;
                }
            } else {
                // a dark house: sometimes a window, if there are papers to spare
                if (this._stage[i] === 0 && lotWindowS(l, 0) - r.bikeS < 40) {
                    this._stage[i] = 1;
                    this._vandal[i] = r.papersLeft > r.subscribersLeft + 5 && this.chance(this.windowChance);
                }
                if (this._stage[i] === 1 && this._vandal[i]) {
                    this._vandalNow = true;
                    if (r.lane > 1) continue;
                    const w = r.bikeS < lotWindowS(l, 0) + 8 ? 0 : 1;
                    if (l.windowBroken[w]) { if (w === 1) this._stage[i] = 2; continue; }
                    if (Number.isNaN(this._err[i])) this._err[i] = this._gauss() * this.aimSigma;
                    if (r.bikeS >= lotWindowS(l, w) + this._err[i]) { this._err[i] = NaN; if (w === 1) this._stage[i] = 2; return true; }
                    if (r.bikeS > lotWindowS(l, 1) + 10) this._stage[i] = 2;
                }
            }
        }
        return false;
    }

    _inFlight(r, l) {
        for (const p of r.papers) if (p.state === 0 && p.s >= l.s0 && p.s < lotEnd(l)) return true;
        return false;
    }

    _gauss() {
        const u1 = 1 - this.rng.nextDouble(), u2 = this.rng.nextDouble();
        return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    }

    // hold down / up to slip between the cross traffic
    _trafficSpeed(r, look) {
        let c = null;
        for (const l of r.lots)
            if (l.kind === LotKind.Crossing && l.traffic && r.bikeS < lotCarLaneS(l, 1) + 14 && l.s0 - r.bikeS < look + 50) { c = l; break; }
        if (c == null) return 0;
        if (c !== this._trafficLot) { this._trafficLot = c; this._trafficErr = this._gauss() * this.trafficSigma; this._trafficBlind = this.chance(this.trafficBlind); }
        if (this._trafficBlind) return 0;
        if (this._safe(r, c, r.cruise)) return 0;
        if (this._safe(r, c, r.cruise * r.slowMul)) return -1;
        if (this._safe(r, c, r.cruise * r.fastMul)) return 1;
        return -1;
    }

    _safe(r, c, v) {
        const reach = CarHS + BikeHS + 1;
        for (let lane = 0; lane < 2; lane++) {
            const ls = lotCarLaneS(c, lane);
            if (r.bikeS > ls + reach) continue;
            const tIn = Math.max(0, (ls - reach - r.bikeS) / v), tOut = (ls + reach - r.bikeS) / v;
            if (tIn > 6) continue;
            for (let tt = tIn; tt <= tOut + 0.001; tt += 0.05) {
                const n = r.carsOnLane(c, lane, r.worldTime + tt + this._trafficErr, this._carL, this._carId);
                for (let i = 0; i < n; i++)
                    if (Math.abs(this._carL[i] - r.bikeL) < CarHL + BikeHL + 3) return false;
            }
        }
        return true;
    }
}
