// THE NODE · world 1 · MUD & METAL · THE CAMERA AND THE PARALLAX LAYERS. Port of MudMetalScroll.cs.
//
// The camera rides with the player: his bike sits PlayerScreenX px from the left edge, so you see
// ~210 px of what's coming. Layers behind the track scroll slower (a factor < 1), everything
// fixed to the track scrolls at 1. Decoration is placed by a hash of the world column, so the
// same stretch of track always shows the same crowd, specks and boards: no state, no drift.
import { f32, roundEven } from '../../sdk/index.js';

export const PlayerScreenX = 96;
export const StartCamX = -64;    // at the gate you see a little run-up behind you

// NOTE: the camera itself (raceCamX / camX) is computed on MudMetalSim (sim.js), which owns Phase;
// keeping it there avoids an import cycle between scroll.js and sim.js. This file only holds the
// phase-independent parallax math.

// screen column of a world x on a layer with this parallax factor
export function toScreen(worldX, camX, factor = 1) {
    return Math.floor(f32(worldX - f32(camX * factor)));
}

// the layer's own coordinate under screen column px (for repeating patterns)
export function layerCoord(camX, factor, px) {
    return Math.floor(f32(camX * factor)) + px;
}

// positive modulo: the phase of a repeating pattern
export function wrap(v, period) {
    const m = v % period;
    return m < 0 ? m + period : m;
}

// integer hash for placed decoration (crowd colours, track specks, board order)
export function hash(x, salt = 0) {
    let h = (Math.imul(x, 374761393) + Math.imul(salt, 668265263)) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
    return (h ^ (h >>> 16)) >>> 0;
}

// smooth-ish rolling hills: a quantised sum of two sines, one height per layer column
export function hillHeight(layerX, amp, salt) {
    const a = Math.sin(layerX * 0.021 + salt) * 0.6 + Math.sin(layerX * 0.047 + salt * 2.3) * 0.4;
    return roundEven((a * 0.5 + 0.5) * amp);
}
