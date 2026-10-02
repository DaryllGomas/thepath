// THE FIRST FLASHES (docs/CONSOLIDATION/chatgpt/07_*): brief intrusions of the larger pattern before the player can know what it
// is. Rare, brief, never explained, never on demand; no strobing, no jump scares. "Wait. Was that there?"
//   1. the basement board: once, after you have looked at its screen for a few seconds, the tube rolls and for 0.2 s the raster
//      forms THE PATH's axis and curve; then it is itself again (js/screens.js BBS.flash).
//   2. one arcade cabinet's attract: once, for about a second, its figures stand in a ring on a vertical axis (one piece of a
//      mark), then the demo goes on.
//   3. the A V R coincidence: once, a floor cabinet's high-score page shows three initials in a row that start A, V and R
//      (ACE, VIC, ROB...), then it is its own table again. A coincidence, not a signature.
// Each is drawn over the tube (a canvas overlay, or the table's display names for a moment): no cartridge's sim is touched.
import * as THREE from 'three';
import { pathMarkSVG } from './marks.js';
import { Drone } from './cabinet/games/swarmpatrol/sprites.js';

const DEG = Math.PI / 180;
const _to = new THREE.Vector3(), _fwd = new THREE.Vector3();
// is the camera looking at this screen: near enough, near the middle of the view, and the tube turned toward it
export function watching(camera, center, normal, maxDist = 4, maxAngle = 20) {
  _to.copy(center).sub(camera.position); const dist = _to.length();
  if (dist > maxDist || dist < 1e-3) return false;
  _to.divideScalar(dist);
  camera.getWorldDirection(_fwd);
  if (_fwd.dot(_to) < Math.cos(maxAngle * DEG)) return false;
  return !normal || normal.dot(_to) < -0.2;
}

// THE PATH's axis and road, as the tube's own phosphor: the real mark (js/marks.js) with only those two parts drawn
export function pathAxisImage(color) {
  const style = `<style>.s{fill:none;stroke:${color};stroke-width:2.4} circle.s{display:none} path.s[d^="M18"]{display:none} .stars,.dots{display:none} .road{fill:${color}}</style>`;
  const svg = pathMarkSVG().replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="480" ').replace(/(<svg[^>]*>)/, '$1' + style);
  const img = new Image(); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  return img;
}

const ATTRACT_GAMES = new Set(['swarmpatrol', 'nebularun', 'lunarduty', 'lastlight', 'sporefield']);
const AVR = { A: ['ACE'], V: ['VIC'], R: ['ROB', 'RAD', 'RIC', 'RTW'] };

export class Flashes {
  constructor() {
    this.count = { bbs: 0, attract: 0, avr: 0 };
    this.gaze = { bbs: 0, attract: new Map(), avr: new Map() };
    this.bbsMarks = { green: pathAxisImage('#8dff7a'), amber: pathAxisImage('#ffb028') };
    this.junctionT = 0;
    this.swap = null;           // the A V R swap while it is up: { cab, rows, names, t }
  }
  // ---- 1. the board (basement). bbs = the BBS (js/screens.js); scr = its screen { center, normal }
  updateBBS(dt, camera, scr, bbs, reading) {
    if (this.count.bbs || !bbs || !scr) return;
    const looking = reading ? !bbs.typing : watching(camera, scr.center, scr.normal, 3.2, 32);
    if (!looking) { this.gaze.bbs = Math.max(0, this.gaze.bbs - dt * 0.5); return; }
    this.gaze.bbs += dt;
    if (this.gaze.bbs < 3.2) return;
    this.count.bbs++;
    bbs.flash(reading ? this.bbsMarks.amber : this.bbsMarks.green);
  }
  // ---- 2 and 3. the floor (inside the Junction). floor: [{ id, cab (js/screens.js Cabinet), center, normal, game }]
  updateFloor(dt, camera, floor, inside) {
    if (this.swap) this._swapTick(dt);
    if (!inside) return;
    this.junctionT += dt;
    if (this.junctionT < 12) return;              // not the first thing you see: settle in first
    for (const f of floor) {
      const R = f.cab && f.cab.runner;
      if (!R || R.phase !== 'attract' || f.cab.overlay) continue;
      const page = R.attract.current;             // 0 title, 1 demo, 2 scores
      const seen = watching(camera, f.center, f.normal, 4.5, 32);
      // 2. a formation in a demo, once
      if (!this.count.attract && page === 1 && ATTRACT_GAMES.has(f.game)) {
        const g = seen ? (this.gaze.attract.get(f.id) || 0) + dt : 0; this.gaze.attract.set(f.id, g);
        if (g > 1.4 && R.attract.pageTime > 3) { this.count.attract++; this._formation(f); }
      }
      // 3. the high scores, once
      if (!this.count.avr && page === 2 && !this.swap) {
        const g = seen ? (this.gaze.avr.get(f.id) || 0) + dt : 0; this.gaze.avr.set(f.id, g);
        if (g > 0.7 && R.attract.pageTime < 4.5 && this._avr(f)) this.count.avr++;
      }
    }
  }
  _formation(f) {
    const cab = f.cab, pal = cab.runner.spec.palette;
    const css = (c) => `rgb(${c.r},${c.g},${c.b})`;
    const body = css(pal.accent), eye = css(pal.highlight);
    const drone = f.game === 'swarmpatrol' ? Drone[0] : null;
    const spriteCols = drone ? [0, 1, 2, 3, 4, 5, 6, 7].map((i) => { try { return css(pal.at(i)); } catch (e) { return body; } }) : null;
    // a ring of twelve on a vertical axis of five that runs through it and past it: one piece of a mark, nothing more
    const pts = [];
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; pts.push([160 + Math.sin(a) * 58, 124 - Math.cos(a) * 58]); }
    for (const y of [38, 81, 124, 167, 210]) if (y !== 124) pts.push([160, y]);
    pts.push([160, 124]);
    const t0 = performance.now();
    const D = 1100;
    cab.overlay = (g) => {
      const e = performance.now() - t0;
      if (e > D) { cab.overlay = null; return; }
      pts.forEach(([x, y], i) => {
        const on = Math.min(1, Math.max(0, (e - i * 14) / 160)) * Math.min(1, Math.max(0, (D - e) / 180));
        if (on <= 0) return;
        g.globalAlpha = on;
        if (drone) {
          const w = drone.width, h = drone.height, ox = Math.round(x - w / 2), oy = Math.round(y - h / 2);
          for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) { const k = drone.at(xx, yy); if (k >= 0) { g.fillStyle = spriteCols[k] || body; g.fillRect(ox + xx, oy + yy, 1, 1); } }
        } else {
          const ox = Math.round(x) - 3, oy = Math.round(y) - 2;
          g.fillStyle = body; g.fillRect(ox, oy + 1, 7, 3); g.fillRect(ox + 1, oy, 5, 1); g.fillRect(ox + 1, oy + 4, 1, 1); g.fillRect(ox + 5, oy + 4, 1, 1);
          g.fillStyle = eye; g.fillRect(ox + 2, oy + 2, 1, 1); g.fillRect(ox + 4, oy + 2, 1, 1);
        }
      });
      g.globalAlpha = 1;
    };
    this.attractAt = { id: f.id, game: f.game };
  }
  // three adjacent names that begin A, V, R, on the top three rows, for a moment
  _avr(f) {
    const table = f.cab.runner.table, rows = table.entries;
    if (rows.length < 3 || rows.slice(0, 3).some((r) => r.player || r.blank)) return false;      // (a held-blank #1 stays blank)
    const taken = new Set(rows.slice(3).map((r) => r.initials));
    const names = ['A', 'V', 'R'].map((ch) => AVR[ch].find((n) => !taken.has(n)));
    if (names.some((n) => !n)) return false;
    this.swap = { cab: f.cab, rows: rows.slice(0, 3), was: rows.slice(0, 3).map((r) => r.initials), t: 0, id: f.id };
    this.swap.rows.forEach((r, i) => { r.initials = names[i]; });
    this.avrAt = { id: f.id, game: f.game, names };
    return true;
  }
  _swapTick(dt) {
    const s = this.swap; s.t += dt;
    const R = s.cab.runner;
    if (s.t < 1.8 && R.phase === 'attract' && R.attract.current === 2) return;
    s.rows.forEach((r, i) => { if (!r.player) r.initials = s.was[i]; });
    this.swap = null;
  }
}
