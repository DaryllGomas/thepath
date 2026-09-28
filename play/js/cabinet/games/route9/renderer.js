// THE NODE · world 1 · ROUTE 9 · THE PICTURE. Port of Route9Renderer.cs.
//
// Everything on the tube is palette-indexed and inside the 8 px safe area:
//   HUD band y 8..29: the score in big display digits, papers left, deliveries /12, the three
//   MISS boxes and the bikes left; a dusk-orange dotted rule under it
//   playfield y 32..231: the street, sheared by view.js so it runs bottom-left to top-right.
//     1) the ground a ROW at a time (every row is one cross-section of the street): backyards,
//        lawns, the front walk, sidewalk joints, curb and gutter, asphalt, the gold centre dashes,
//        crossings with zebra stripes, the far sidewalk and lawn, the finish checker
//     2) flat things: houses (roof + front wall "folded down", repainted per house: pastel and lit
//        when they take the paper, purple and dark when they don't, or once you've missed them),
//        porch-light pools (a dithered gold checker nailed to the ground), potholes, parked and
//        crossing cars, papers lying where they fell
//     3) upright things, far to near: trees, lamps, signs, mailboxes, dogs, the trike, the mower,
//        the bundle, the bike; each with a flat shadow
//     4) papers in the air (a spinning roll on an arc, its shadow on the ground), score popups
//   cards on double-framed plates: ROUTE 9 / GET READY, CRASH!, ROUTE DONE, GAME OVER.
// Blinks run at 1 Hz; the invulnerable bike blinks at 2.5 Hz; nothing strobes.
import { PixelFont, SurfaceDraw, d6, dn } from '../../sdk/index.js';
import * as Art from './art.js';
import { Route9View, Left, Top, Right, Bottom, floorDiv } from './view.js';
import {
    Route9Sim, HazardType, LotKind, Subscribers, MailboxL, WallL, DogHomeL, BundleL,
    HouseS0, HouseS1, DoorOff, PorchHalf, WindowHalf,
    lotEnd, lotMailboxS, lotDoorS, lotWindowS, lotCarLaneS, lotCarDir, lotBundleS,
} from './sim.js';
import { Route9Spec, Route9Palette } from './spec.js';

const LampEvery = 176, LampOff = 60;

function mod(a, m) { const r = a % m; return r < 0 ? r + m : r; }

function hash(a, b) {
    let h = (Math.imul(a, 0x9E3779B1) ^ Math.imul(b, 0x85EBCA77)) >>> 0;
    h = (h ^ (h >>> 15)) >>> 0;
    h = Math.imul(h, 0x2C1B3C6D) >>> 0;
    h = (h ^ (h >>> 12)) >>> 0;
    return h;
}

function frame(t, hz) { return (Math.trunc(t * hz) & 1) === 0; }

export class Route9Renderer {
    constructor() {
        const pal = this.pal = Route9Palette;
        this.baseMap = [];
        for (let i = 0; i < 30; i++) this.baseMap.push(i < pal.count ? pal.at(i) : pal.at(0));
        this.houseMap = this.baseMap.slice();
        this.carMap = this.baseMap.slice();
        this.shadowMap = [];
        this.cBg = pal.get('bg'); this.cPaper = pal.get('paper'); this.cRed = pal.get('red');
        this.cAsph = pal.get('asphalt'); this.cAsphDk = pal.get('asphaltDk');
        this.cWalk = pal.get('sidewalk'); this.cWalkDk = pal.get('sidewalkDk');
        this.cLawn = pal.get('lawn'); this.cLawnDk = pal.get('lawnDk');
        this.cDusk = pal.get('dusk'); this.cGold = pal.get('gold'); this.cCurb = pal.get('curb');
        this.cShadow = pal.get('shadow'); this.cPurple = pal.get('purple');
        this.cHedge = pal.get('hedge'); this.cGlass = pal.get('glass'); this.cRoof = pal.get('roof'); this.cRoofDk = pal.get('roofDk');
        for (let i = 0; i < 30; i++) this.shadowMap.push(this.cShadow);
        this.pastels = [pal.get('pink'), pal.get('blue'), pal.get('mint'), pal.get('lemon')];
        this.carColors = [pal.get('red'), pal.get('blue'), pal.get('mint'), pal.get('lemon'), pal.get('pink'), pal.get('denim'), pal.get('paper')];

        this._ups = [];
        this._carL = new Float64Array(8); this._carId = new Int32Array(8);
    }

    draw(sim, s, t) {
        const r = sim;
        s.noClip();
        s.clear(this.cBg);
        if (r == null || r.lots.length === 0) return;
        const v = Route9View.follow(r.p === Route9Sim.Phase.Crash ? r.crashS : r.bikeS);

        s.clip(Left, Top, Right - Left, Bottom - Top);
        this._drawGround(s, r, v);
        this._drawFlat(s, r, v, t);
        this._drawUpright(s, r, v, t);
        this._drawAir(s, r, v, t);
        s.noClip();
        this._drawHud(s, r, t);
        this._drawCards(s, r, t);
    }

    // ------------------------------------------------------------ 1) the ground, a row at a time
    _drawGround(g, r, v) {
        const seg = (y, x0, l0, l1, c) => g.rect(x0 + l0, y, l1 - l0, 1, c);
        for (let y = Top; y < Bottom; y++) {
            const s = v.rowS(y);
            const x0 = v.rowX(s);
            const lot = r.lotAt(s);
            const so = s - lot.s0;
            if (lot.kind === LotKind.Crossing) { this._crossingRow(g, y, x0, s, so); continue; }

            // back yards and the side yards between houses
            seg(y, x0, -400, 0, this.cLawnDk);
            if (mod(s, 6) === 0) seg(y, x0, -6, -5, this.cCurb); else seg(y, x0, -6, -5, this.cWalkDk);   // a picket fence
            seg(y, x0, 0, 106, this.cLawn);
            // the front walk from the porch to the sidewalk
            if (lot.kind === LotKind.House && so >= DoorOff - 4 && so < DoorOff + 4) {
                seg(y, x0, 70, 106, this.cWalk);
                if (so === DoorOff - 4 || so === DoorOff + 3) seg(y, x0, 70, 106, this.cWalkDk);
            }
            seg(y, x0, 106, 108, this.cLawnDk);
            // the sidewalk, with its joints
            seg(y, x0, 108, 130, mod(s, 16) === 0 ? this.cWalkDk : this.cWalk);
            // curb and gutter
            seg(y, x0, 130, 132, this.cCurb); seg(y, x0, 132, 133, this.cWalkDk); seg(y, x0, 133, 134, this.cAsphDk);
            // the road, the gold centre dashes, a few specks of aggregate
            seg(y, x0, 134, 196, this.cAsph);
            if (mod(s, 24) < 12) seg(y, x0, 175, 177, this.cGold);
            for (let l = 136; l < 194; l += 7)
                if ((hash(s, l) & 63) === 0) g.setPixel(x0 + l + (hash(l, s) % 5), y, this.cAsphDk);
            // far curb, far sidewalk, far lawn
            seg(y, x0, 196, 197, this.cAsphDk); seg(y, x0, 197, 198, this.cWalkDk); seg(y, x0, 198, 200, this.cCurb);
            seg(y, x0, 200, 222, mod(s, 16) === 8 ? this.cWalkDk : this.cWalk);
            seg(y, x0, 222, 225, this.cLawnDk);
            seg(y, x0, 225, 600, this.cLawn);
            if (mod(s, 6) === 3) seg(y, x0, 272, 273, this.cCurb); else seg(y, x0, 272, 273, this.cWalkDk);   // far fence
            seg(y, x0, 273, 600, this.cLawnDk);

            // the finish: a checker across the sidewalk and road
            const fs = s - Math.trunc(r.finishS);
            if (fs >= 0 && fs < 8)
                for (let l = 108; l < 222; l += 4)
                    seg(y, x0, l, l + 4, ((Math.trunc((l - 108) / 4) + Math.trunc(fs / 4)) & 1) === 0 ? this.cPaper : this.cBg);
        }
    }

    _crossingRow(g, y, x0, s, so) {
        const seg = (l0, l1, c) => g.rect(x0 + l0, y, l1 - l0, 1, c);
        const walkRow = so < 8 || so >= 56;
        if (walkRow) {
            seg(-400, 108, this.cWalk);
            seg(222, 600, this.cWalk);
            seg(108, 134, this.cWalk);
            seg(196, 222, this.cWalk);
            if (mod(s, 8) === 0) { seg(-400, 134, this.cWalkDk); seg(196, 600, this.cWalkDk); }
            seg(134, 196, this.cAsph);
            // zebra crossing over the main road
            if ((so >= 1 && so < 7) || (so >= 57 && so < 63))
                for (let l = 136; l < 196; l += 8) seg(l, l + 4, this.cPaper);
            if (so === 7 || so === 56) { seg(-400, 134, this.cCurb); seg(196, 600, this.cCurb); }
            return;
        }
        seg(-400, 600, this.cAsph);
        if (so === 8 || so === 55) { seg(-400, 132, this.cAsphDk); seg(198, 600, this.cAsphDk); }
        if (so === 31 || so === 32)
            for (let l = -400; l < 600; l += 16)
                if (l + 8 <= 130 || l >= 200) seg(l, l + 8, this.cGold);
        for (let l = -60; l < 400; l += 9)
            if ((hash(s, l) & 63) === 0) g.setPixel(x0 + l, y, this.cAsphDk);
    }

    // ------------------------------------------------------------ 2) flat things
    _drawFlat(g, r, v, t) {
        const near = v.nearS - 90, far = v.farS + 4;
        for (const lot of r.lots) {
            if (lotEnd(lot) < near || lot.s0 > far) continue;
            if (lot.kind !== LotKind.House) continue;
            const lit = lot.subscriber && !lot.missed;
            this.houseMap[25] = lit ? this.pastels[lot.pastel] : this.cPurple;             // p wall
            this.houseMap[26] = lit ? this.cGold : this.cGlass;                              // q glass
            this.houseMap[27] = lit ? this.cDusk : this.cShadow;                             // r porch light
            this.houseMap[28] = lit ? this.cRoof : this.cRoofDk;                             // s roof front
            this.houseMap[29] = lit ? this.cRoofDk : this.cShadow;                           // t roof back
            v.ground(g, Art.House, lot.s0 + HouseS0, 0, this.houseMap, (lot.house & 1) === 0);
            for (let w = 0; w < 2; w++)
                if (lot.windowBroken[w]) v.ground(g, Art.WindowBroken, lotWindowS(lot, w) - 6, 38, this.baseMap);
            if (lit) v.groundEllipse(g, lotDoorS(lot), 64, 8, 7, this.cGold, true);    // the porch light's pool
            if (lot.delivered && lot.deliveredBy === 2) v.ground(g, Art.PaperGround, lotDoorS(lot) - 3, 59, this.baseMap);
        }
        // lamp pools on the far sidewalk
        for (let k = floorDiv(near, LampEvery); k <= floorDiv(far, LampEvery) + 1; k++)
            v.groundEllipse(g, k * LampEvery + LampOff, 206, 12, 9, this.cGold, true);

        for (const h of r.hazards) {
            if (h.s < near || h.s > far + 40) continue;
            if (h.type === HazardType.Pothole)
                v.ground(g, Art.Pothole, h.s - 6, h.l - 11, this.baseMap);
            else if (h.type === HazardType.ParkedCar) {
                v.ground(g, Art.Car, h.s - 19, h.l - 6, this.shadowMap);
                this._paintCar(h.variant);
                v.ground(g, Art.Car, h.s - 17, h.l - 8, this.carMap);
            }
        }
        // cross traffic
        for (const c of r.lots) {
            if (c.kind !== LotKind.Crossing || !c.traffic || lotEnd(c) < near || c.s0 > far) continue;
            for (let lane = 0; lane < 2; lane++) {
                const n = r.carsOnLane(c, lane, r.worldTime, this._carL, this._carId);
                for (let i = 0; i < n; i++) {
                    this._paintCar(hash(c.carSeed, this._carId[i] * 2 + lane) % 7);
                    const left = lotCarDir(lane) < 0;
                    v.ground(g, Art.CarSide, lotCarLaneS(c, lane) - 10, this._carL[i] - 15, this.shadowMap, false, left);
                    v.ground(g, Art.CarSide, lotCarLaneS(c, lane) - 8, this._carL[i] - 17, this.carMap, false, left);
                }
            }
        }
        // papers that fell short
        for (const p of r.papers)
            if (p.state === 1) v.ground(g, Art.PaperGround, p.s - 3, p.l - 6, this.baseMap);
    }

    _paintCar(variant) {
        this.carMap[25] = this.carColors[((variant % this.carColors.length) + this.carColors.length) % this.carColors.length];
        this.carMap[26] = this.cCurb;
    }

    // ------------------------------------------------------------ 3) upright things
    _drawUpright(g, r, v, t) {
        const ups = this._ups;
        ups.length = 0;
        const near = v.nearS - 10, far = v.farS + 40;
        // scenery: far-side trees and bushes, lamps, back-yard trees
        for (let k = floorDiv(near, 70) - 1; k <= floorDiv(far, 70) + 1; k++) {
            const h = hash(k, 77);
            ups.push({ s: k * 70 + (h % 24), l: 244 + (h >>> 8) % 12, spr: Art.Tree, map: this.baseMap, flip: false, lift: 0, shadow: 10 });
            ups.push({ s: k * 70 + 38 + (h >>> 4) % 10, l: 232, spr: Art.Bush, map: this.baseMap, flip: false, lift: 0, shadow: 0 });
            if (((h >>> 12) & 1) === 0) ups.push({ s: k * 70 + 50, l: 290 + (h >>> 16) % 20, spr: Art.Tree, map: this.baseMap, flip: false, lift: 0, shadow: 10 });
        }
        for (let k = floorDiv(near, LampEvery); k <= floorDiv(far, LampEvery) + 1; k++)
            ups.push({ s: k * LampEvery + LampOff, l: 218, spr: Art.Lamp, map: this.baseMap, flip: false, lift: 0, shadow: 0 });
        for (const lot of r.lots) {
            if (lotEnd(lot) < near - 100 || lot.s0 > far) continue;
            if (lot.kind === LotKind.House) {
                ups.push({ s: lot.s0 + 80, l: -18, spr: Art.Tree, map: this.baseMap, flip: false, lift: 0, shadow: 0 });
                if (lot.subscriber) {
                    const mb = lot.delivered ? Art.MailboxFed : lot.missed ? Art.MailboxOff : Art.MailboxWait;
                    ups.push({ s: lotMailboxS(lot), l: MailboxL, spr: mb, map: this.baseMap, flip: false, lift: 0, shadow: 5 });
                }
            } else if (lot.kind === LotKind.Start) {
                ups.push({ s: 118, l: 98, spr: Art.Shield, map: this.baseMap, flip: false, lift: 0, shadow: 6 });
                ups.push({ s: 30, l: 40, spr: Art.Tree, map: this.baseMap, flip: false, lift: 0, shadow: 10 });
                ups.push({ s: 96, l: 22, spr: Art.Tree, map: this.baseMap, flip: false, lift: 0, shadow: 10 });
                ups.push({ s: 140, l: 60, spr: Art.Bush, map: this.baseMap, flip: false, lift: 0, shadow: 0 });
                ups.push({ s: 60, l: 80, spr: Art.Bush, map: this.baseMap, flip: false, lift: 0, shadow: 0 });
            } else if (lot.kind === LotKind.Crossing) {
                ups.push({ s: lot.s0 - 5, l: 104, spr: Art.Stop, map: this.baseMap, flip: false, lift: 0, shadow: 4 });
                ups.push({ s: lotEnd(lot) + 5, l: 226, spr: Art.Stop, map: this.baseMap, flip: false, lift: 0, shadow: 4 });
            } else if (lot.kind === LotKind.Bundle) {
                ups.push({ s: lot.s0 + 20, l: 40, spr: Art.Tree, map: this.baseMap, flip: false, lift: 0, shadow: 10 });
                ups.push({ s: lot.s0 + 66, l: 60, spr: Art.Bush, map: this.baseMap, flip: false, lift: 0, shadow: 0 });
                if (!lot.bundleTaken)
                    ups.push({ s: lotBundleS(lot), l: BundleL, spr: Art.Bundle, map: this.baseMap, flip: false, lift: 0, shadow: 9 });
            } else if (lot.kind === LotKind.Finish) {
                ups.push({ s: lot.s0 + 40, l: 30, spr: Art.Tree, map: this.baseMap, flip: false, lift: 0, shadow: 10 });
                ups.push({ s: lot.s0 + 130, l: 50, spr: Art.Tree, map: this.baseMap, flip: false, lift: 0, shadow: 10 });
                ups.push({ s: lot.s0 + 190, l: 20, spr: Art.Tree, map: this.baseMap, flip: false, lift: 0, shadow: 10 });
            }
        }
        // hazards that stand up
        for (const h of r.hazards) {
            if (h.s < near || h.s > far) continue;
            if (h.type === HazardType.Dog) {
                let spr, flip = false;
                if (h.state === 1) spr = frame(t, 8) ? Art.DogA : Art.DogB;
                else if (h.state === 2) spr = frame(t, 4) ? Art.DogBark : Art.DogA;
                else if (h.state === 3) { spr = frame(t, 8) ? Art.DogA : Art.DogB; flip = true; }
                else spr = Art.DogB;
                ups.push({ s: h.s, l: h.l, spr, map: this.baseMap, flip, lift: 0, shadow: 8 });
            } else if (h.type === HazardType.Trike)
                ups.push({ s: h.s, l: h.l, spr: h.state === 1 && frame(t, 4) ? Art.TrikeB : Art.TrikeA, map: this.baseMap, flip: false, lift: 0, shadow: 8 });
            else if (h.type === HazardType.Mower)
                ups.push({ s: h.s, l: h.l, spr: frame(t, 5) ? Art.MowerA : Art.MowerB, map: this.baseMap, flip: h.vel < 0, lift: 0, shadow: 10 });
        }
        // the bike (or what is left of it)
        if (r.p === Route9Sim.Phase.Crash)
            ups.push({ s: r.crashS, l: r.crashL, spr: r.phaseTime < 0.6 ? Art.CrashA : Art.CrashB, map: this.baseMap, flip: false, lift: 0, shadow: 12 });
        else if (r.p !== Route9Sim.Phase.Idle) {
            const show = r.invuln <= 0 || (Math.trunc(r.invuln * 5) & 1) === 0;     // 2.5 Hz while invulnerable
            if (show) {
                const spr = r.throwAge < 0.22 ? Art.BikeThrow : (Math.trunc(r.bikeS / 7) & 1) === 0 ? Art.BikeA : Art.BikeB;
                ups.push({ s: r.bikeS, l: r.bikeL, spr, map: this.baseMap, flip: false, lift: 0, shadow: 11 });
            }
        }

        ups.sort((a, b) => b.s - a.s);
        for (const u of ups)
            if (u.shadow > 0) v.groundEllipse(g, u.s - 1, u.l + 2, u.shadow, 2, this.cShadow, false);
        for (const u of ups) v.upright(g, u.spr, u.s, u.l, u.map, u.flip, u.lift);

        // the END sign
        this._drawEndSign(g, r, v);
    }

    _drawEndSign(g, r, v) {
        const y = v.y(r.finishS), x = v.x(r.finishS, 96);
        if (y < Top || y > Bottom + 40) return;
        g.rect(x - 1, y - 16, 3, 17, this.cBg); g.rect(x, y - 16, 1, 16, this.cWalkDk);
        const dsp = PixelFont.Display;
        const w = dsp.measure('END', 1) + 8;
        g.rect(x - Math.trunc(w / 2) - 1, y - 30, w + 2, 15, this.cBg);
        g.rect(x - Math.trunc(w / 2), y - 29, w, 13, this.cPaper);
        g.frame(x - Math.trunc(w / 2) + 1, y - 28, w - 2, 11, this.cRed);
        g.textCentered('END', x, y - 26, dsp, this.cRed);
    }

    // ------------------------------------------------------------ 4) the air
    _drawAir(g, r, v, t) {
        for (const p of r.papers) {
            if (p.state !== 0) continue;
            const u = Math.min(1, p.age / p.dur);
            const h = 11 * (1 - u) + 22 * 4 * u * (1 - u);
            v.groundEllipse(g, p.s, p.l, 3, 1, this.cShadow, true);
            const spin = Math.trunc(p.age * 16) & 3;
            const spr = spin === 0 ? Art.Paper0 : spin === 1 ? Art.Paper1 : spin === 2 ? Art.Paper2 : Art.Paper3;
            v.upright(g, spr, p.s, p.l, this.baseMap, false, Math.trunc(h) + 3);
        }
        // papers spilling out of a crash
        if (r.p === Route9Sim.Phase.Crash && r.phaseTime < 1.2) {
            const pt = r.phaseTime;
            for (let k = 0; k < 3; k++) {
                const dl = (k - 1) * 22 * Math.min(1, pt / 0.7);
                const ds = (6 + k * 5) * Math.min(1, pt / 0.7);
                const hh = Math.max(0, 26 * Math.sin(Math.min(1, pt / 0.7) * Math.PI) + 4 - pt * 4);
                const spin = (Math.trunc(pt * 14) + k) & 3;
                const spr = spin === 0 ? Art.Paper0 : spin === 1 ? Art.Paper1 : spin === 2 ? Art.Paper2 : Art.Paper3;
                v.upright(g, spr, r.crashS + ds, r.crashL + dl, this.baseMap, false, Math.trunc(hh) + 4);
            }
        }
        // popups rise and go
        const arc = PixelFont.Arcade;
        for (const pp of r.popups) {
            if (pp.kind === 4) continue;
            const age = r.time - pp.born;
            let x = v.x(pp.s, pp.l), y = v.y(pp.s) - 26 - Math.trunc(age * 14);
            const c = pp.kind === 0 ? this.cGold : pp.kind === 1 ? this.cDusk : pp.kind === 2 ? this.cRed : this.cPaper;
            x = Math.max(Left + Math.trunc(arc.measure(pp.text) / 2) + 1, Math.min(Right - Math.trunc(arc.measure(pp.text) / 2) - 2, x));
            if (y < Top + 2) continue;
            g.textCenteredShadow(pp.text, x, y, arc, c, this.cBg);
        }
    }

    // ------------------------------------------------------------ HUD
    _drawHud(g, r, t) {
        const dsp = PixelFont.Display, arc = PixelFont.Arcade, sm = PixelFont.Small;
        g.text(d6(Math.min(999999, r.score)), 8, 10, dsp, this.cPaper, 2);
        // papers left
        g.blit(Art.IconPaper, 110, 14, this.pal);
        const low = r.papersLeft <= 3 && r.p === Route9Sim.Phase.Riding;
        g.text(dn(r.papersLeft, 2), 127, 10, dsp, low && SurfaceDraw.blink(t) ? this.cRed : this.cPaper, 2);
        // deliveries
        g.blit(Art.IconMailbox, 166, 11, this.pal);
        g.text(dn(r.delivered, 2), 179, 10, dsp, this.cGold, 2);
        g.text('/12', 211, 19, arc, this.cGold);
        // the three misses
        for (let i = 0; i < r.missesToEnd; i++) {
            const x = 236 + i * 9;
            if (i < r.missed) {
                g.rect(x, 11, 8, 8, this.cRed);
                g.line(x + 1, 12, x + 6, 17, this.cPaper); g.line(x + 6, 12, x + 1, 17, this.cPaper);
            } else g.frame(x, 11, 8, 8, this.cPurple);
        }
        g.text('MISS', 236, 22, sm, this.cPurple);
        // bikes left
        g.blit(Art.IconBike, 268, 10, this.pal);
        g.text(String(Math.max(0, r.lives)), 292, 10, dsp, r.lives <= 1 ? this.cRed : this.cPaper, 2);
        g.dottedRule(8, 312, 29, 3, this.cDusk);
    }

    // ------------------------------------------------------------ cards
    _drawCards(g, r, t) {
        const dsp = PixelFont.Display, arc = PixelFont.Arcade;
        const spec = Route9Spec;
        if (r.p === Route9Sim.Phase.Intro) {
            g.textBox('ROUTE 9', 160, 64, dsp, 3, this.cGold, this.cDusk, this.cBg);
            g.plate(76, 100, 168, r.mercyActive ? 52 : 40, this.cBg, this.cDusk);
            g.textCentered('DELIVER TO ALL 12', 160, 106, arc, this.cPaper);
            g.textCentered('SUBSCRIBERS', 160, 117, arc, this.cPaper);
            if (SurfaceDraw.blink(r.phaseTime + 0.25)) g.textCentered('GET READY', 160, 128, arc, this.cGold);
            if (r.mercyActive) g.textCentered('FREE RIDE: NO HAZARDS', 160, 140, arc, this.cDusk);
        } else if (r.p === Route9Sim.Phase.Crash) {
            g.textBox('CRASH!', 160, 70, dsp, 3, this.cPaper, this.cRed, this.cBg);
            const left = r.lives <= 0 ? 'NO BIKES LEFT' : r.lives === 1 ? 'LAST BIKE' : r.lives + ' BIKES LEFT';
            const w = arc.measure(left) + 20;
            g.plate(160 - Math.trunc(w / 2), 102, w, 17, this.cBg, this.cRed);
            g.textCentered(left, 160, 107, arc, r.lives <= 1 ? this.cRed : this.cPaper);
        } else if (r.p === Route9Sim.Phase.Card || r.p === Route9Sim.Phase.Over) {
            const won = r.roundWon;
            g.textBox(won ? spec.roundWonText : spec.roundLostText, 160, 58, dsp, 3, won ? this.cGold : this.cDusk, won ? this.cGold : this.cRed, this.cBg);
            g.plate(64, 92, 192, 68, this.cBg, won ? this.cGold : this.cRed);
            g.textCentered('DELIVERED ' + r.delivered + ' OF 12', 160, 100, arc, this.cPaper);
            g.textCentered('SCORE ' + d6(r.score), 160, 114, arc, this.cGold, 2);
            const why = won ? (r.windows > 0 ? r.windows + ' WINDOWS  ' : '') + r.lives + (r.lives === 1 ? ' BIKE' : ' BIKES') + ' SPARE'
                             : r.endReason;
            g.textCentered(why, 160, 140, arc, won ? this.cPaper : this.cRed);
        }
    }
}
