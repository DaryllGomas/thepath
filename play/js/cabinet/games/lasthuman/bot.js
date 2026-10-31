// THE NODE · world 1 · LAST HUMAN on the Cabinet Engine · THE BOT: a modelled average player.
// Began as the port of LastHumanBot.cs; built out 2026-10-18 to play all seven waves.
//
// It has what a player has: one stick, A and B, one decision every ~0.1 s (jittered). Because moving and
// aiming are the same stick, it plays the way a one-stick shooter is played:
//   PANIC     a machine, a noticed shot or the mainframe inside 1.5 tiles (a pylon inside a half): run
//             for open space (the least crowded of the 8 ways; walls, pylons and the mainframe count as
//             crowd), fire held, so the stream clears the way ahead
//   RESCUE    nothing at all inside 2 tiles and a human on the floor: break for the nearest one (one a
//             cortex is turning first), unless a machine, a pylon or a shot sits on the path
//   THE MAINFRAME  nothing close: stand well below it under the nearest gun pod (the core when the
//             shutters part), face up and hold fire; slide across with B held so the stream keeps going
//   SHOOT     the target is lined up on one of the 8 axes (or close): let go of the stick, tap it once
//             to turn that way, stand and hold fire. A crusher that close gets the stream too (it cannot
//             die, but the stream shoves it off). Targets: the nearest machine that can die; a hatcher or
//             a cortex turning a human counts as nearer than it is
//   ALIGN     otherwise walk to line the target up on an axis, sidestepping rather than walking into
//             it; when it already faces the target it often holds B, so the stream keeps going
// Mistakes, like people make: 8% of turns pick the neighbouring direction, 15% of the time a shot is
// not noticed, and the reaction time wanders 0.08-0.15 s. Its dice are its own.
import { CabinetBotBase, InputFrame } from '../../sdk/index.js';
import { LastHumanRound, MachineKind, Shutter, Dir8 } from './round.js';

const T = LastHumanRound.Tile;
const Phase = LastHumanRound.Phase;
const AW = LastHumanRound.AW, AH = LastHumanRound.AH;
const BOSS_FLOOR = LastHumanRound.BossFloor;

function dist(x, y) { return Math.sqrt(x * x + y * y); }

export class LastHumanBot extends CabinetBotBase {
    constructor() {
        super();
        this.reaction = 0.11;
        this.panicTiles = 1.5;
        this.pylonPanic = 0.5;
        this.safeTiles = 2;
        this.closeTiles = 2.5;
        this.aimSlop = 0.08;
        this.sparkNotice = 0.85;
        this.lockUse = 0.6;
        this.bossStand = 132;

        this.moveDir = -1; this.turnDir = -1; this.lastMove = -1;
        this.fire = false; this.lock = false;
        this.thinkLeft = 0;
    }

    get name() { return 'lh-average-player'; }

    reset(seed) {
        super.reset(seed);
        this.moveDir = this.turnDir = this.lastMove = -1; this.fire = false; this.lock = false; this.thinkLeft = 0;
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
        f.b = this.lock && this.moveDir >= 0;
        return f;
    }

    decide(s) {
        const px = s.playerX, py = s.playerY;
        this.fire = true;
        this.turnDir = -1;
        this.lock = false;
        const boss = s.boss != null && s.boss.alive ? s.boss : null;

        // ---- how close is the nearest danger (clearance: centre distance minus its size)
        let nearM = null, nearMc = 1e9, threat = 1e9;
        for (const m of s.machines) {
            if (!m.live) continue;
            const c = dist(m.x - px, m.y - py) - m.radius;
            if (m.kind === MachineKind.Pylon) { if (c < this.pylonPanic * T) threat = Math.min(threat, c + (this.panicTiles - this.pylonPanic) * T - 1); continue; }
            if (c < nearMc) { nearMc = c; nearM = m; }
        }
        threat = Math.min(threat, nearMc);
        for (const sp of s.shots) {
            if (sp.dead || !this.chance(this.sparkNotice)) continue;
            const c = dist(sp.x - px, sp.y - py) - 2;
            if (c < threat) threat = c;
        }
        if (boss != null) {
            for (const p of boss.pods) {
                if (p.dead) continue;
                const c = dist(boss.podX(p) - px, boss.podY - py) - 6;
                if (c < threat) threat = c;
            }
            const c = py - BOSS_FLOOR;
            if (c < threat) threat = c;
        }

        if (threat < this.panicTiles * T) { this.moveDir = this.escape(s); this.lastMove = this.moveDir; return; }

        // ---- a human on the floor and nothing within two tiles: go get them (one being turned first)
        if (threat > this.safeTiles * T) {
            let best = null, bd = 1e9;
            for (const c of s.humans) {
                if (!c.free) continue;
                const d = dist(c.x - px, c.y - py) * (c.conv > 0 ? 0.5 : 1);
                if (d < bd) { bd = d; best = c; }
            }
            if (best != null) {
                const dd = dist(best.x - px, best.y - py);
                const dir = Dir8.fromVector(best.x - px, best.y - py);
                for (let k = 0; k < 3; k++) {
                    const d = k === 0 ? dir : k === 1 ? (dir + 1) & 7 : (dir + 7) & 7;
                    if (this.pathClear(s, d, dd)) { this.moveDir = d; this.lastMove = d; return; }
                }
            }
        }

        // ---- the target: the nearest machine that can die (a hatcher, or a cortex turning a human, counts nearer)
        let target = null, td = 1e9;
        for (const m of s.machines) {
            if (!m.live || !m.required) continue;
            let d = dist(m.x - px, m.y - py);
            if (m.kind === MachineKind.Hatcher) d *= 0.6;
            else if (m.kind === MachineKind.Cortex && m.turning > 0) d *= 0.4;
            if (d < td) { td = d; target = m; }
        }
        if (target != null) td = dist(target.x - px, target.y - py);
        if (nearM != null && nearM.kind === MachineKind.Crusher && nearMc < 3 * T) { target = nearM; td = nearMc + nearM.radius; }

        // ---- the mainframe, when nothing is close
        if (boss != null && (target == null || td > 3.5 * T)) { this.bossPlay(s, boss); return; }

        if (target == null) {
            // nothing solid to shoot: hold the middle of the floor and wait for the warp
            const cx = AW / 2 - px, cy = AH / 2 - py;
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
        // already facing it: keep the stream on it while stepping onto its line
        if (this.moveDir >= 0 && (((s.face - d8 + 8) & 7) <= 1 || ((d8 - s.face + 8) & 7) <= 1)) this.lock = this.chance(this.lockUse);
    }

    // under the mainframe: line up under a pod (the core when it opens), face up, hold fire
    bossPlay(s, b) {
        const px = s.playerX, py = s.playerY;
        let tx = b.x;
        const coreOpen = b.shutter === Shutter.Open || (b.shutter === Shutter.Opening && b.shutterT < 0.3);
        if (!coreOpen) {
            let bd = 1e9;
            for (const p of b.pods) {
                if (p.dead) continue;
                const d = Math.abs(b.podX(p) - px);
                if (d < bd) { bd = d; tx = b.podX(p); }
            }
        }
        const dx = tx - px;
        const low = py < this.bossStand - 14, high = py > this.bossStand + 28;
        let d;
        if (Math.abs(dx) <= 3) {
            if (s.face !== 0) { this.moveDir = -1; this.turnDir = 0; return; }
            d = low ? 4 : high ? 0 : -1;
        } else if (dx > 0) d = low ? 3 : high ? 1 : 2;
        else d = low ? 5 : high ? 7 : 6;
        if (d >= 0 && this.blocked(s, d)) d = this.escape(s);
        this.moveDir = d;
        this.lastMove = d;
        this.lock = s.face === 0;
        if (d >= 0 && !this.lock && s.face !== 0 && Math.abs(dx) < 24) { this.moveDir = -1; this.turnDir = 0; }
    }

    // the cheapest of the three ways to put the target on an axis, never into a wall or a pylon
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
        const top = s.boss != null && !s.boss.gone ? BOSS_FLOOR + 4 : 7;
        if (nx < 6 || nx > AW - 6 || ny < top || ny > AH - 7) return true;
        for (const m of s.machines) {
            if (m.dead || m.kind !== MachineKind.Pylon) continue;
            const dx = m.x - nx, dy = m.y - ny;
            if (dx * dx + dy * dy < 12 * 12) return true;
        }
        return false;
    }

    // run for the least crowded way: machines, shots, warp-ins, pylons, the mainframe and the walls all push
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
            const w = m.kind === MachineKind.Pylon ? 2 : m.live ? (m.kind === MachineKind.Crusher ? 1.5 : 1) : 0.4;
            v += w / (dx * dx + dy * dy + 16);
        }
        for (const sp of s.shots) {
            if (sp.dead) continue;
            // where it will be in a moment counts too
            const dx = sp.x - x, dy = sp.y - y, fx = sp.x + sp.vx * 0.15 - x, fy = sp.y + sp.vy * 0.15 - y;
            v += 0.8 / (dx * dx + dy * dy + 16) + 0.8 / (fx * fx + fy * fy + 16);
        }
        // walls (and the mainframe's floor): out of bounds is the worst place there is
        const top = s.boss != null && !s.boss.gone ? BOSS_FLOOR : 0;
        if (x < 5 || y < top + 6 || x > AW - 5 || y > AH - 6) v += 1;
        const wx = Math.min(x, AW - x), wy = Math.min(y - top, AH - y);
        v += 0.8 / (wx * wx + 16) + (top > 0 ? 2.4 : 0.8) / (wy * wy + 16);
        return v;
    }

    pathClear(s, d, len) {
        const ux = Dir8.ux(d), uy = Dir8.uy(d);
        for (const m of s.machines) {
            if (m.dead) continue;
            const rx = m.x - s.playerX, ry = m.y - s.playerY;
            const along = rx * ux + ry * uy;
            if (along < -4 || along > len + 8) continue;
            if (Math.abs(rx * uy - ry * ux) < m.radius + (m.kind === MachineKind.Pylon ? 7 : 10)) return false;
        }
        for (const sp of s.shots) {
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
