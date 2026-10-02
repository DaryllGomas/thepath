// THE REDRAW · the progress row: seven small dots along the bottom of the glass, just above the bezel (the storyboard's
// f1/f2: evenly spaced, dim grey-gold; a lit one warm gold). One lights per game beaten.
//
//   const row = new ProgressRow({ count: 7, y: 872, spacing: 64, cx: 633 })
//   row.attach(kit) / row.detach(kit)      a GlowDots layer in that kit's scene (it follows the kit's size)
//   row.draw(lit, alpha)                   lit[i] 0..1 per dot (eased by the caller), alpha 0..1 for the whole row
//   row.pos(i)                             frame coords of dot i
// Safety: a dot lights by easing (never a step), and it is small.
import { GlowDots } from '../lookkit/index.js';

const UNLIT = { core: [0.62, 0.48, 0.24], r: 6.4, halo: [0.09, 0.065, 0.025], hr: 14 };
const LIT = { core: [1.45, 0.86, 0.24], r: 7.4, halo: [0.42, 0.22, 0.035], hr: 22 };

export class ProgressRow {
  constructor(o = {}) {
    this.count = o.count ?? 7; this.y = o.y ?? 872; this.spacing = o.spacing ?? 64; this.cx = o.cx ?? 633;
    this.dots = new GlowDots(this.count * 2 + 8);
    this.dots.object.renderOrder = o.renderOrder ?? 23;
  }
  pos(i) { return [this.cx + (i - (this.count - 1) / 2) * this.spacing, this.y]; }
  attach(kit) { kit.track(this.dots); kit.scene.add(this.dots.object); return this; }
  detach(kit) { kit.scene.remove(this.dots.object); return this; }
  draw(lit = [], alpha = 1) {
    const d = this.dots; d.clear();
    for (let i = 0; i < this.count; i++) {
      const k = Math.max(0, Math.min(1, lit[i] ?? 0)), [x, y] = this.pos(i);
      const mix = (a, b) => [0, 1, 2].map((c) => (a[c] + (b[c] - a[c]) * k) * alpha);
      d.add(x, y, UNLIT.hr + (LIT.hr - UNLIT.hr) * k, mix(UNLIT.halo, LIT.halo));
      d.add(x, y, UNLIT.r + (LIT.r - UNLIT.r) * k, mix(UNLIT.core, LIT.core));
    }
    d.commit();
  }
}
