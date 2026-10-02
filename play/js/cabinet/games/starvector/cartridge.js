// THE NODE · THE JUNCTION · STARVECTOR (the super-scaler) · THE CARTRIDGE: spec + factories.
// The old Asteroids-style Starvector lives in ../_retired/starvector_asteroids/.
import { CabinetCartridge } from '../../sdk/index.js';
import { StarvectorSpec, StarvectorPalette, Progress } from './spec.js';
import { StarvectorRound, SV } from './sim.js';
import { StarvectorRenderer, drawTitle, HI as HI_TUBE } from './renderer.js';
import { StarvectorBot } from './bot.js';

StarvectorSpec.drawTitle = drawTitle;        // the logo, made in code (the SDK's attract calls it for the title page)

/** The picture is drawn at two sizes by two copies of the same renderer: the plain one (480 x 360) for the in-world tube, and, only
 *  while a cabinet is shown full screen (or on starvector.html), a sharp one (Sharp.k, default 2 = 640 x 480; ?rk=3 on the page = 960 x 720).
 *  The sharp one costs more, so it is only drawn when asked: renderer.sharp = true, after Sharp.load(). Both also copy a frame to the
 *  runner's 320 x 240 surface, so the freeze, the name entry and the tube read the same either way. */
export const Sharp = {
    k: 2, mod: null, p: null,
    load(k = Sharp.k) { Sharp.k = k; return Sharp.p || (Sharp.p = import('./renderer.js?k=' + k).then((m) => (Sharp.mod = m)).catch((e) => { console.warn('[starvector] sharp renderer', e); return null; })); },
    /** the 'HI' frame store of the renderer that last drew (the sharp one if it is loaded and asked for) */
    hi(sharp) { return sharp && Sharp.mod ? Sharp.mod.HI : HI_TUBE; },
};
class DualRenderer {
    constructor() { this.a = new StarvectorRenderer(); this.b = null; this.sharp = false; }
    warm() { if (Sharp.mod && !this.b) this.b = new Sharp.mod.StarvectorRenderer(); return !!this.b; }
    get usingSharp() { return !!(this.sharp && Sharp.mod); }
    draw(sim, surface, t) {
        if (this.usingSharp) { this.warm(); this.b.draw(sim, surface, t); } else this.a.draw(sim, surface, t);
    }
}

export const StarvectorCartridge = new CabinetCartridge(
    StarvectorSpec, () => new StarvectorRound(), () => new DualRenderer(), () => new StarvectorBot('good'));

export { StarvectorSpec, StarvectorPalette, StarvectorRound, StarvectorRenderer, StarvectorBot, Progress, SV };
