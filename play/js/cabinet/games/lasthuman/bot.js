// THE NODE · world 1 · LAST HUMAN on the Cabinet Engine · THE BOT: a modelled average player.
// Port of LastHumanBot.cs.
//
// It has what a player has: one stick and the A button, one decision every ~0.1 s (jittered). Because
// moving and facing are the same stick, it plays the way a one-stick Robotron is played:
//   PANIC     a machine or a noticed spark inside 1.5 tiles: run for open space (the least crowded of
//             the 8 ways, walls count as crowd), fire held, so the stream clears the way ahead
//   RESCUE    nothing at all inside 2 tiles and a human on the floor: break for the nearest one, unless
//             a machine or spark sits on the path
//   SHOOT     the nearest machine is lined up on one of the 8 axes (or close): let go of the stick, tap
//             it once to turn that way, stand and hold fire. A hulk that close gets the stream too (it
//             cannot die, but the stream shoves it off)
//   ALIGN     otherwise walk to line the nearest machine up on an axis, sidestepping rather than walking
//             into it
// Mistakes, like people make: 8% of turns pick the neighbouring direction, 15% of the time a spark is
// not noticed, and the reaction time wanders 0.08-0.15 s. Its dice are its own.
import { CabinetBotBase, InputFrame } from '../../sdk/index.js';
import { LastHumanRound, MachineKind, Dir8 } from './round.js';

const T = LastHumanRound.Tile;
const Phase = LastHumanRound.Phase;

function dist(x, y) { return Math.sqrt(x * x + y * y); }

export class LastHumanBot extends CabinetBotBase {
    constructor() {
        super();
        this.reaction = 0.11;
        this.panicTiles = 1.5;
        this.safeTiles = 2;
        this.closeTiles = 2.5;
        this.aimSlop = 0.08;
        this.sparkNotice = 0.85;

        this.moveDir = -1; this.turnDir = -1; this.lastMove = -1;
        this.fire = false;
        this.thinkLeft = 0;
    }

    get name() { return 'lh-average-player'; }

    reset(seed) {
        super.reset(seed);
        this.moveDir = this.turnDir = this.lastMove = -1; this.fire = false; this.thinkLeft = 0;
    }

    think(sim, dt) {
        const s = sim instanceof LastHumanRound ? sim : null;
        if (!s || s.p !== Phase.Play) { this.moveDir = this.turnDir = -1; this.thinkLeft = 0; return InputFrame.neutral; }
        this.thinkLeft -= dt;
        if (this.thinkLeft <= 0) { this.decide(s); this.thinkLeft = this.reaction * this.range(0.7, 1.4); }
        let f;
        if (this.moveDir >= 0) f = Dir8.stick(this.moveDir);
        else if (this.turnDir >= 0 && s.face !== this.turnDir) f = Dir8.stick(this.turnDir);   // one step: turn in place
        else f = InputFrame.neutral;
        f.a = this.fire;
        return f;
    }

    decide(s) {
        const px = s.playerX, py = s.playerY;
        this.fire = true;
        this.turnDir = -1;

        // ---- how close is the nearest danger (clearance: centre distance minus its size)
        let nearM = null, nearMc = 1e9;
        for (const m of s.machines) {
            if (!m.live) continue;
            const c = dist(m.x - px, m.y - py) - m.radius;
            if (c < nearMc) { nearMc = c; nearM = m; }
        }
        let threat = nearMc;
        for (const sp of s.sparks) {
            if (sp.dead || !this.chance(this.sparkNotice)) continue;
            const c = dist(sp.x - px, sp.y - py) - 2;
            if (c < threat) threat = c;
        }

        if (threat < this.panicTiles * T) { this.moveDir = this.escape(s); this.lastMove = this.moveDir; return; }

        // ---- a human on the floor and nothing within two tiles: go get them
        if (threat > this.safeTiles * T) {
            let best = null, bd = 1e9;
            for (const c of s.civilians) {
                if (c.saved) continue;
                const d = dist(c.x - px, c.y - py);
                if (d < bd) { bd = d; best = c; }
            }
            if (best != null) {
                const dir = Dir8.fromVector(best.x - px, best.y - py);
                for (let k = 0; k < 3; k++) {
                    const dd = k === 0 ? dir : k === 1 ? (dir + 1) & 7 : (dir + 7) & 7;
                    if (this.pathClear(s, dd, bd)) { this.moveDir = dd; this.lastMove = dd; return; }
                }
            }
        }

        // ---- the nearest killable machine (or a hulk that is right on top of us)
        let target = null, td = 1e9;
        for (const m of s.machines) {
            if (!m.live || !m.killable) continue;
            const d = dist(m.x - px, m.y - py);
            if (d < td) { td = d; target = m; }
        }
        if (nearM != null && nearM.kind === MachineKind.Hulk && nearMc < 3 * T) { target = nearM; td = nearMc + nearM.radius; }
        if (target == null) {
            // nothing solid to shoot: hold the middle of the floor and wait for the warp
            const cx = LastHumanRound.AW / 2 - px, cy = LastHumanRound.AH / 2 - py;
            this.moveDir = dist(cx, cy) > 2 * T ? Dir8.fromVector(cx, cy) : -1;
            this.lastMove = this.moveDir;
            return;
        }

        const rx = target.x - px, ry = target.y - py;
        const d8 = Dir8.fromVector(rx, ry);
        const lat = this.lateral(rx, ry, d8);
        if (lat <= target.radius + 1.5 || td < this.closeTiles * T) {
            this.moveDir = -1;
            this.turnDir = this.chance(this.aimSlop) ? (d8 + (this.chance(0.5) ? 1 : 7)) & 7 : d8;
            this.lastMove = -1;
            return;
        }
        this.moveDir = this.align(s, rx, ry);
        this.lastMove = this.moveDir;
    }

    // the cheapest of the three ways to put the target on an axis, never into a wall
    align(s, rx, ry) {
        const ax = Math.abs(rx), ay = Math.abs(ry);
        const c0 = ay, c1 = ax, c2 = Math.abs(ax - ay) * 0.7071;
        const d0 = ry > 0 ? 4 : 0;                                  // step toward its row
        const d1 = rx > 0 ? 2 : 6;                                  // step toward its column
        const d2 = ax > ay ? (ry > 0 ? 0 : 4) : (rx > 0 ? 6 : 2);   // step away on the short axis: the diagonal closes in
        let best = -1, bc = 1e9;
        for (let k = 0; k < 3; k++) {
            const c = k === 0 ? c0 : k === 1 ? c1 : c2;
            const d = k === 0 ? d0 : k === 1 ? d1 : d2;
            if (this.blocked(s, d)) continue;
            if (c < bc) { bc = c; best = d; }
        }
        return best >= 0 ? best : this.escape(s);
    }

    blocked(s, d) {
        const nx = s.playerX + Dir8.ux(d) * 8, ny = s.playerY + Dir8.uy(d) * 8;
        return nx < 6 || nx > LastHumanRound.AW - 6 || ny < 7 || ny > LastHumanRound.AH - 7;
    }

    // run for the least crowded way: machines, sparks, warp-ins and the walls all push
    escape(s) {
        let best = 0, bs = 1e30;
        for (let d = 0; d < 8; d++) {
            const ux = Dir8.ux(d), uy = Dir8.uy(d);
            let sc = this.danger(s, s.playerX + ux * 7, s.playerY + uy * 7)
                + this.danger(s, s.playerX + ux * 16, s.playerY + uy * 16)
                + 0.6 * this.danger(s, s.playerX + ux * 32, s.playerY + uy * 32);
            if (d === this.lastMove) sc *= 0.9;
            if (sc < bs) { bs = sc; best = d; }
        }
        return best;
    }

    danger(s, x, y) {
        let v = 0;
        for (const m of s.machines) {
            if (m.dead) continue;
            const dx = m.x - x, dy = m.y - y;
            const w = m.live ? (m.kind === MachineKind.Hulk ? 1.5 : 1) : 0.4;
            v += w / (dx * dx + dy * dy + 16);
        }
        for (const sp of s.sparks) {
            if (sp.dead) continue;
            const dx = sp.x - x, dy = sp.y - y;
            v += 1.2 / (dx * dx + dy * dy + 16);
        }
        // walls: out of bounds is the worst place there is
        if (x < 5 || y < 6 || x > LastHumanRound.AW - 5 || y > LastHumanRound.AH - 6) v += 1;
        const wx = Math.min(x, LastHumanRound.AW - x), wy = Math.min(y, LastHumanRound.AH - y);
        v += 0.8 / (wx * wx + 16) + 0.8 / (wy * wy + 16);
        return v;
    }

    pathClear(s, d, len) {
        const ux = Dir8.ux(d), uy = Dir8.uy(d);
        for (const m of s.machines) {
            if (m.dead) continue;
            const rx = m.x - s.playerX, ry = m.y - s.playerY;
            const along = rx * ux + ry * uy;
            if (along < -4 || along > len + 8) continue;
            if (Math.abs(rx * uy - ry * ux) < m.radius + 10) return false;
        }
        for (const sp of s.sparks) {
            if (sp.dead) continue;
            const rx = sp.x - s.playerX, ry = sp.y - s.playerY;
            const along = rx * ux + ry * uy;
            if (along < -4 || along > len + 8) continue;
            if (Math.abs(rx * uy - ry * ux) < 10) return false;
        }
        return !this.blocked(s, d);
    }

    lateral(rx, ry, d) {
        const ux = Dir8.ux(d), uy = Dir8.uy(d);
        if (rx * ux + ry * uy <= 0) return 1e9;
        return Math.abs(rx * uy - ry * ux);
    }
}
