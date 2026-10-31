// THE NODE · world 1 · SPRITE POP on the Cabinet Engine · THE BOT: a modelled average player.
// Began as the port of SpritePopBot.cs (Staging/Batch2/spritepop); taught the tower on 2026-10-18 (the new
// creatures, the special bubbles, corks and gears, the alarm and the Tin King).
//
// It plays through the control panel like anyone else: the stick (left / right / up to jump, one
// jump per PRESS) and button A (one bubble per PRESS). It reads the game but never writes to it,
// and rolls only its own dice (CabinetBotBase.rng).
//
//   THE BRIEF'S THREE RULES
//     1. BLOW the instant a free creature is in the arc ahead (level with it, 0-64 px in front),
//        after a human's reaction (shotReact x0.6..1.6) and only if it notices (shotNotice).
//     2. POP an already-trapped bubble only if no free creature is closer than it.
//     3. JUMP AWAY from a danger closing in on its level (if it notices: wary): a creature still
//        30+ px off and behind it gets turned on and shot instead; the king and the alarm cannot be
//        shot, so it always runs from them.
//   THE TOWER
//     corks and gears: once it has seen one (shotWary, after 0.12-0.3 s) it works out where the
//     shot will pass; a cork along its row it jumps, anything else it steps out from under.
//     specials: a FIZZ or SPARK bubble no further than its prey gets popped (it does not aim them);
//     a LETTER is a treat like fruit (greedy). In the king's room SPARKS are the plan: the nearest
//     one not too near the king, then the king's own bubble; with nothing to fetch it keeps to the
//     spot furthest from him.
//   GETTING ABOUT
//     The level's nav graph (walk / jump / fall / wrap edges, tiles.js) takes it to a spot
//     two or three tiles from its quarry on the quarry's row, under a bubble, or to fruit.
//     Decisions every react s (x0.8..1.3); between them its hands carry the plan out (stop on a
//     column, jump when lined up, steer a fall), as a player's would.
//   THE AVERAGE PLAYER IN IT
//     greedy     0.65   chance it goes for fruit (or a letter) when nothing free is within 72 px
//     dither     0.06   chance per decision it hesitates (drops the plan for a beat)
//     lookUp     0.8    chance it is paying attention (re-rolled every 1.0-1.6 s): when it is, it looks
//                       up before jumping and down before stepping off an edge
//     and it gives up on a spot it has not reached in 2.5 s and does something else for a moment.
// intent (hunt / pop / spark / fruit / flee / face / dodge / safe / dither / unstick / idle) is for the
// Lab's diagnostics only.
import { f32, roundEven, CabinetBotBase, InputFrame, Pad } from '../../sdk/index.js';
import { SpritePopSim } from './round.js';
import { SpritePopLevel } from './tiles.js';

const Phase = SpritePopSim.Phase, CState = SpritePopSim.CState, BType = SpritePopSim.BType, KState = SpritePopSim.KState;
const Tile = SpritePopLevel.Tile;
const InnerL = SpritePopLevel.InnerL, InnerR = SpritePopLevel.InnerR;
const JumpRise = SpritePopLevel.JumpRise;
const Far = SpritePopLevel.Far;
const colOf = SpritePopLevel.colOf, colCenter = SpritePopLevel.colCenter;

export class SpritePopBot extends CabinetBotBase {
    constructor() {
        super();
        this.react = f32(0.16);
        this.shotReact = f32(0.13);
        this.shotNotice = f32(0.88);
        this.wary = f32(0.72);
        this.shotWary = f32(0.8);
        this.dangerRange = f32(40);
        this.arc = f32(64);
        this.greedy = f32(0.65);
        this.dither = f32(0.06);
        this.lookUpChance = f32(0.8);
        this.intent = 'idle';
        this._fleeing = false; this._dropping = false;
        this._seen = new WeakMap();                     // shot -> what it made of it (noticed? when?)
        this._dangers = [];                             // this step's: { x, y, big } (creatures, the king, the alarm)
        this._clear();
    }

    get name() { return 'sp-average-player'; }

    _clear() {
        this._thinkLeft = 0; this._arcTime = 0; this._arcNeed = 0; this._stuckT = 0; this._unstickT = 0; this._ditherT = 0; this._lookT = 0;
        this._lookUp = true;
        this._jumpWhenThere = false; this._jumpNow = false;
        this._moveTo = f32(-1); this._airTo = f32(-1);
        this._faceDir = 0; this._holdDir = 0; this._lastNode = -2;
        this._dodgeDir = 0; this._dodgeT = 0;
    }

    reset(seed) {
        super.reset(seed);
        this._clear();
        this._fleeing = false; this._dropping = false;
        this._seen = new WeakMap();
        this.intent = 'idle';
    }

    think(sim, dt) {
        const s = sim;
        if (s == null || s.p !== Phase.Play || s.cub == null) {
            this._thinkLeft = 0; this._arcTime = 0; this._moveTo = f32(-1); this._airTo = f32(-1); this._jumpNow = false; this._jumpWhenThere = false; this._holdDir = 0; this._faceDir = 0;
            this._dodgeT = 0;
            return InputFrame.neutral;
        }
        const cub = s.cub;
        this._gatherDangers(s);

        // ---- rule 1: the shot, watched every step
        const inArc = this._creatureInArc(s, cub.face);
        if (inArc) {
            // a slow notice is a late shot, not a blind spot: it sees it a beat later
            if (this._arcTime <= 0) {
                const a = f32(this.shotReact * this.range(0.6, 1.6));
                this._arcNeed = f32(a + (this.chance(this.shotNotice) ? 0 : this.range(0.25, 0.6)));
            }
            this._arcTime = f32(this._arcTime + dt);
        }
        else this._arcTime = 0;
        const fire = inArc && this._arcTime >= this._arcNeed && s.cool <= 0;

        // ---- corks and gears: a reflex, once it has seen them
        const dodge = this._shotReflex(s, dt);
        if (dodge.dir !== 0) { this._dodgeDir = dodge.dir; this._dodgeT = f32(0.25); }
        if (this._dodgeT > 0) this._dodgeT = f32(this._dodgeT - dt);

        // ---- decisions at a human pace
        this._thinkLeft = f32(this._thinkLeft - dt);
        this._lookT = f32(this._lookT - dt);
        if (this._lookT <= 0) { this._lookT = this.range(1.0, 1.6); this._lookUp = this.chance(this.lookUpChance); }   // attention slips now and then
        if (this._unstickT > 0) this._unstickT = f32(this._unstickT - dt);
        if (this._ditherT > 0) this._ditherT = f32(this._ditherT - dt);
        if (this._thinkLeft <= 0 && this._unstickT <= 0) {
            this._thinkLeft = f32(this.react * this.range(0.8, 1.3));
            this._decide(s);
        }

        // ---- the hands: carry the plan out
        let stick = 0;
        const tol = Math.max(f32(1.5), f32(s.cubSpeed * dt));
        const avoid = !cub.grounded && this._lookUp ? this._airAvoid(s) : 0;
        if (this._dodgeT > 0) { stick = this._dodgeDir; this.intent = 'dodge'; }
        else if (avoid !== 0) stick = avoid;                   // steering clear of a bad landing
        else if (!cub.grounded && this._airTo >= 0) {
            const d = f32(this._airTo - cub.cx);
            stick = Math.abs(d) > tol ? Math.sign(d) : 0;
        }
        else if (this._holdDir !== 0) stick = this._holdDir;
        else if (this._moveTo >= 0) {
            const d = f32(this._moveTo - cub.cx);
            if (Math.abs(d) > tol) stick = Math.sign(d);
            if (this._dropping && stick !== 0 && this._lookUp && !this._clearBelow(s, this._moveTo)) stick = 0;   // wait at the edge
            else if (this._jumpWhenThere && cub.grounded && this._clearAbove(s)) { this._jumpNow = true; this._jumpWhenThere = false; }
        }
        else if (this._faceDir !== 0 && cub.face !== this._faceDir) { stick = this._faceDir; this._faceDir = 0; }

        const f = new InputFrame(stick);
        if (dodge.jump) this._jumpNow = true;
        if (this._jumpNow && cub.grounded && !this.lastFrame.digital(Pad.Up) && (this._fleeing || dodge.jump || this._clearAbove(s))) { f.y = 1; this._jumpNow = false; }
        if (fire && !this.lastFrame.a) { f.a = true; this._arcTime = 0; }
        return f;
    }

    // what can hurt it this step: free creatures (not a faded wisp), the king, the alarm
    _gatherDangers(s) {
        const d = this._dangers;
        d.length = 0;
        for (const c of s.creatures) if (c.state === CState.Free && !c.faded) d.push({ x: c.cx, y: c.cy, big: 0, c });
        const k = s.king;
        if (k != null && k.vulnerable) d.push({ x: k.cx, y: k.cy, big: 16, c: null });
        if (s.alarm.on) d.push({ x: f32(s.alarm.x + 8), y: f32(s.alarm.y + 8), big: 4, c: null });
    }

    // a cork or a gear that will pass through it soon: jump a cork on its row, step out from under the rest
    _shotReflex(s, dt) {
        const cub = s.cub, out = { dir: 0, jump: false };
        for (const sh of s.shots) {
            let m = this._seen.get(sh);
            if (m === undefined) { m = { notice: this.chance(this.shotWary), t: 0, need: this.range(0.12, 0.3) }; this._seen.set(sh, m); }
            m.t = f32(m.t + dt);
            if (!m.notice || m.t < m.need) continue;
            const px = f32(sh.x - cub.cx), py = f32(sh.y - cub.cy);
            const vv = f32(f32(sh.vx * sh.vx) + f32(sh.vy * sh.vy));
            if (vv <= 0) continue;
            const tc = f32(-f32(f32(px * sh.vx) + f32(py * sh.vy)) / vv);
            if (tc < 0 || tc > f32(0.9)) continue;
            const qx = f32(px + f32(sh.vx * tc)), qy = f32(py + f32(sh.vy * tc));
            if (Math.abs(qx) > 13 || Math.abs(qy) > 13) continue;
            if (Math.abs(sh.vy) < f32(Math.abs(sh.vx) * f32(0.5)) && cub.grounded) { if (tc < f32(0.4)) out.jump = true; }
            else out.dir = qx >= 0 ? -1 : 1;
            if (cub.x <= f32(InnerL + 2) && out.dir < 0) out.dir = 1;
            if (cub.x >= f32(InnerR - cub.w - 2) && out.dir > 0) out.dir = -1;
            return out;
        }
        return out;
    }

    // a player glances up before jumping through a platform: anything free right over the cub?
    _clearAbove(s) {
        if (!this._lookUp) return true;
        const cub = s.cub;
        for (const d of this._dangers) {
            const dx = f32(d.x - cub.cx), dy = f32(d.y - cub.cy);
            if (Math.abs(dx) < 34 + d.big && dy < 4 + d.big && dy > f32(-JumpRise - 20 - d.big)) return false;
        }
        return true;
    }

    // in the air: something where it is about to come down (or right beside it)? steer away
    _airAvoid(s) {
        const cub = s.cub;
        let near = null, nd = f32(1e9);
        for (const c of this._dangers) {
            const dx = f32(c.x - cub.cx), dy = f32(c.y - cub.cy);
            const landing = cub.vy > 0 && dy > -4 - c.big && dy < 44 + c.big && Math.abs(dx) < 30 + c.big;
            const beside = Math.abs(dy) < 16 + c.big && Math.abs(dx) < 26 + c.big;
            if (!landing && !beside) continue;
            const d = f32(Math.abs(dx) + Math.abs(dy));
            if (d < nd) { nd = d; near = c; }
        }
        if (near == null) return 0;
        let away = near.x >= cub.cx ? -1 : 1;
        if (cub.x <= f32(InnerL + 1) && away < 0) away = 1;
        if (cub.x >= f32(InnerR - cub.w - 1) && away > 0) away = -1;
        return away;
    }

    // ...and down before stepping off an edge into column x
    _clearBelow(s, x) {
        const cub = s.cub;
        for (const c of this._dangers) {
            const dx = f32(c.x - x), dy = f32(c.y - cub.cy);
            if (Math.abs(dx) < 24 + c.big && dy > -6 - c.big && dy < 70) return false;
        }
        return true;
    }

    _creatureInArc(s, face) {
        const cub = s.cub;
        for (const c of s.creatures) {
            if (c.state !== CState.Free || c.faded) continue;
            const dx = f32(f32(c.cx - cub.cx) * face), dy = f32(c.cy - cub.cy);
            if (dx > -2 && dx < this.arc && Math.abs(dy) < 12) return true;
        }
        return false;
    }

    // ------------------------------------------------------------------ decisions
    _decide(s) {
        const cub = s.cub;
        const L = s.level;
        this._holdDir = 0; this._faceDir = 0;
        if (!cub.grounded) return;
        this._fleeing = false; this._dropping = false;               // in the air: keep steering where it meant to land
        this._jumpNow = false;

        const cur = L.node(colOf(cub.cx), roundEven(f32(cub.feet / Tile)));
        if (cur === this._lastNode) this._stuckT = f32(this._stuckT + this._thinkLeft); else { this._stuckT = 0; this._lastNode = cur; }

        // ---- rule 3: something closing in on me
        let threat = null, td = f32(1e9);
        for (const d of this._dangers) {
            const dx = f32(d.x - cub.cx), dy = f32(d.y - cub.cy);
            const level = Math.abs(dy) < 20 + d.big && Math.abs(dx) < this.dangerRange + d.big * 1.5;
            const above = dy < 0 && dy > -44 - d.big && Math.abs(dx) < 18 + d.big;
            if (!level && !above) continue;
            const dd = f32(Math.abs(dx) + Math.abs(dy));
            if (dd < td) { td = dd; threat = d; }
        }
        if (threat != null && this.chance(this.wary)) {
            const dx = f32(threat.x - cub.cx), dy = f32(threat.y - cub.cy);
            const toward = dx >= 0 ? 1 : -1;
            const level = Math.abs(dy) < 12;
            const shootable = threat.c != null;
            if (shootable && level && toward === cub.face && s.cool <= 0 && Math.abs(dx) > 14) {
                this.intent = 'face'; this._moveTo = f32(-1); this._jumpWhenThere = false;   // it is in the arc: let rule 1 blow
                return;
            }
            if (shootable && level && toward !== cub.face && Math.abs(dx) > 30 && s.cool <= 0) {
                this.intent = 'face'; this._moveTo = f32(-1); this._jumpWhenThere = false; this._faceDir = toward;
                return;
            }
            this.intent = 'flee'; this._fleeing = true;
            let away = -toward;
            if (cub.x <= f32(InnerL + 4) && away < 0) away = 1;
            if (cub.x >= f32(InnerR - cub.w - 4) && away > 0) away = -1;
            this._holdDir = away; this._moveTo = f32(-1); this._jumpWhenThere = false;
            if (level && this._clearAbove(s)) this._jumpNow = true;
            this._airTo = clamp(f32(cub.cx + f32(away * 40)), f32(InnerL + 8), f32(InnerR - 8));
            return;
        }

        if (this.chance(this.dither)) this._ditherT = this.range(0.15, 0.4);
        if (this._ditherT > 0) { this.intent = 'dither'; this._moveTo = f32(-1); this._jumpWhenThere = false; return; }

        if (cur < 0) {
            // standing over an edge (centre past the last block): step back onto the platform
            this.intent = 'idle'; this._jumpWhenThere = false;
            const row = roundEven(f32(cub.feet / Tile)), col = colOf(cub.cx);
            const back = L.standable(col - 1, row) ? col - 1 : L.standable(col + 1, row) ? col + 1 : col;
            this._moveTo = colCenter(back);
            return;
        }

        if (this._stuckT > f32(2.5)) {
            // it has stood on this spot too long without getting where it wanted: shake it up
            this.intent = 'unstick'; this._stuckT = 0; this._unstickT = f32(0.5);
            this._holdDir = this.chance(0.5) ? -1 : 1; this._jumpNow = this.chance(0.5); this._moveTo = f32(-1);
            this._airTo = clamp(f32(cub.cx + f32(this._holdDir * 48)), f32(InnerL + 8), f32(InnerR - 8));
            return;
        }

        // ---- what is there to go for
        let prey = null, pd = f32(1e9);
        for (const c of s.creatures) {
            if (c.state !== CState.Free || c.faded) continue;
            const d = dist(f32(c.cx - cub.cx), f32(c.cy - cub.cy));
            if (d < pd) { pd = d; prey = c; }
        }
        const k = s.king;
        let trap = null, bd = f32(1e9), weapon = null, wd = f32(1e9), letter = null, ld = f32(1e9), kingB = null;
        for (const b of s.bubbles) {
            if (!b.alive) continue;
            const d = dist(f32(b.x - cub.cx), f32(b.y - cub.cy));
            if (b.held != null) { if (d < bd) { bd = d; trap = b; } }
            else if (b.type === BType.King) kingB = b;
            else if (b.type === BType.Letter) { if (b.age > 0.5 && d < ld) { ld = d; letter = b; } }
            else if (b.type === BType.Fizz || b.type === BType.Spark) {
                if (b.age < 0.5 || b.life < 0.6) continue;
                if (k != null && k.vulnerable && dist(f32(b.x - k.cx), f32(b.y - k.cy)) < 44) continue;   // not under his nose
                if (d < wd) { wd = d; weapon = b; }
            }
        }
        let fruit = null, fd = f32(1e9);
        for (const fr of s.fruits) {
            if (!fr.alive || !fr.grounded) continue;
            const d = dist(f32(fr.cx - cub.cx), f32(fr.cy - cub.cy));
            if (d < fd) { fd = d; fruit = fr; }
        }

        if (kingB != null) { this._goPop(s, cur, kingB); return; }
        if (s.isBoss && k != null && k.vulnerable) {
            // the king's room: a trapped minion right here, else the sparks, else keep away from him
            if (trap != null && bd < 48) { this._goPop(s, cur, trap); return; }
            if (weapon != null) { this.intent = 'spark'; this._goPop(s, cur, weapon); this.intent = 'spark'; return; }
            if (fruit != null && fd < 60 && dist(f32(fruit.cx - k.cx), f32(fruit.cy - k.cy)) > 70 && this._goFruit(s, cur, fruit)) return;
            if (prey != null && pd < 70) { this._goHunt(s, cur, prey); return; }
            this._goSafe(s, cur, k);
            return;
        }
        if (trap != null && bd < pd) { this._goPop(s, cur, trap); return; }
        if (weapon != null && prey != null && wd < f32(pd + 20)) { this._goPop(s, cur, weapon); return; }
        if (letter != null && ld < 110 && (prey == null || pd > 72) && this.chance(this.greedy)) { this._goPop(s, cur, letter); return; }
        if (fruit != null && (prey == null || pd > 72) && (prey == null || this.chance(this.greedy)) && this._goFruit(s, cur, fruit)) return;
        if (prey != null) { this._goHunt(s, cur, prey); return; }
        if (trap != null) { this._goPop(s, cur, trap); return; }
        if (letter != null) { this._goPop(s, cur, letter); return; }
        this.intent = 'idle'; this._moveTo = f32(-1); this._jumpWhenThere = false;
    }

    _goPop(s, cur, b) {
        this.intent = 'pop';
        const cub = s.cub, L = s.level;
        const dx = f32(b.x - cub.cx), dy = f32(b.y - cub.cy);
        if (Math.abs(dx) < 12 && dy < -8 && dy > f32(-JumpRise - 10)) {
            this._moveTo = b.x; this._jumpWhenThere = false; this._jumpNow = true; this._airTo = b.x;
            return;
        }
        if (Math.abs(dx) < 40 && Math.abs(dy) < 14) { this._moveTo = b.x; this._jumpWhenThere = false; this._airTo = b.x; return; }
        const bc = colOf(b.x);
        let best = -1, bestCost = Far;
        for (let n = 0; n < L.nodeCount; n++) {
            const col = L.nodeCol(n);
            if (Math.abs(col - bc) > 1) continue;
            const cy = f32(L.nodeRow(n) * Tile - 8);
            if (b.y < f32(f32(cy - JumpRise) - 8) || b.y > f32(cy + 10)) continue;
            const cost = L.dist(cur, n) + Math.abs(col - bc);
            if (cost < bestCost) { bestCost = cost; best = n; }
        }
        if (best < 0) { this._goNear(s, cur, b.x, b.y); return; }
        if (best === cur) {
            this._moveTo = b.x; this._airTo = b.x;
            this._jumpWhenThere = b.y < f32(cub.cy - 8);
            return;
        }
        this._route(s, cur, best);
    }

    _goFruit(s, cur, f) {
        const L = s.level;
        const n = L.node(colOf(f.cx), roundEven(f32(f.feet / Tile)));
        if (n < 0 || L.dist(cur, n) > 12) return false;
        this.intent = 'fruit';
        if (n === cur) { this._moveTo = f.cx; this._airTo = f.cx; this._jumpWhenThere = false; return true; }
        this._route(s, cur, n);
        return true;
    }

    _goHunt(s, cur, c) {
        this.intent = 'hunt';
        const cub = s.cub, L = s.level;
        const cc = colOf(c.cx);
        const row = !SpritePopSim.flies(c.kind) && c.grounded
            ? roundEven(f32(c.feet / Tile))
            : roundEven(f32(f32(c.cy + 8) / Tile));
        let best = -1, bestCost = f32(1e9);
        for (let n = 0; n < L.nodeCount; n++) {
            const dr = Math.abs(L.nodeRow(n) - row);
            const dc = Math.abs(L.nodeCol(n) - cc);
            if (dr > 1 || dc < 2 || dc > 4) continue;
            const d = L.dist(cur, n);
            if (d >= Far) continue;
            const cost = f32(f32(d + f32(dr * 4)) + f32(Math.abs(dc - 3) * f32(0.7)));
            if (cost < bestCost) { bestCost = cost; best = n; }
        }
        if (best < 0) { this._goNear(s, cur, c.cx, c.cy); return; }
        if (best === cur) {
            this._moveTo = f32(-1); this._jumpWhenThere = false;
            this._faceDir = c.cx >= cub.cx ? 1 : -1;
            return;
        }
        this._route(s, cur, best);
    }

    // the king's room with nothing to fetch: the reachable spot furthest from him (not too far to walk)
    _goSafe(s, cur, k) {
        this.intent = 'safe';
        const L = s.level;
        let best = -1, bs = f32(-1e9);
        for (let n = 0; n < L.nodeCount; n++) {
            const d = L.dist(cur, n);
            if (d >= Far) continue;
            const away = dist(f32(colCenter(L.nodeCol(n)) - k.cx), f32(f32(L.nodeRow(n) * Tile - 8) - k.cy));
            const score = f32(Math.min(away, 120) - f32(d * 3));
            if (score > bs) { bs = score; best = n; }
        }
        if (best < 0 || best === cur) { this._moveTo = f32(-1); this._jumpWhenThere = false; this._faceDir = k.cx >= s.cub.cx ? 1 : -1; return; }
        this._route(s, cur, best);
    }

    // no good spot: the reachable spot nearest the point
    _goNear(s, cur, x, y) {
        const L = s.level;
        let best = -1, bd = f32(1e9);
        for (let n = 0; n < L.nodeCount; n++) {
            if (L.dist(cur, n) >= Far) continue;
            const d = dist(f32(colCenter(L.nodeCol(n)) - x), f32(f32(L.nodeRow(n) * Tile - 8) - y));
            if (d < bd) { bd = d; best = n; }
        }
        if (best < 0 || best === cur) { this._moveTo = x; this._airTo = x; this._jumpWhenThere = false; return; }
        this._route(s, cur, best);
    }

    // follow the graph: run along the row to the last walk, then jump / step off
    _route(s, cur, goal) {
        const L = s.level;
        let at = cur, guard = 0;
        this._jumpWhenThere = false; this._dropping = false;
        while (at !== goal && guard++ < 40) {
            const nh = L.nextHop(at, goal);
            if (nh < 0) break;
            const e = L.edgeTo(at, nh);
            if (e.kind === SpritePopLevel.EdgeWalk) { at = nh; continue; }
            if (e.kind === SpritePopLevel.EdgeJump) {
                this._moveTo = colCenter(L.nodeCol(at));
                this._airTo = this._moveTo; this._jumpWhenThere = true;
                return;
            }
            // a fall: walk off into the next column and steer down it
            this._dropping = at === cur;
            this._moveTo = f32(colCenter(e.col) + f32(Math.sign(e.col - L.nodeCol(at)) * 4));
            this._airTo = colCenter(e.col);
            return;
        }
        this._moveTo = colCenter(L.nodeCol(at));
        this._airTo = this._moveTo;
    }
}

function dist(x, y) { return f32(Math.sqrt(f32(f32(x * x) + f32(y * y)))); }
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
