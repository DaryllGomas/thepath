// THE NODE · world 1 · IRON DOJO (Ironclad Amusements, 1985) · THE SCROLL: the side-scroll camera.
// Port of IronDojoScroll.cs (Staging/Batch3/irondojo), float for float.
//
// The pagoda floor is a strip floorLength px wide; the tube shows 320 of it (the play window is
// x 8..311, inside the curved-tube safe area). The camera follows the fighter with a lead in the
// direction he faces, eases toward it, clamps at both ends of the floor, and snaps to whole
// pixels so the floor boards never shimmer. Sim and renderer share one of these: the sim uses it
// to spawn attackers just off either edge of the tube, the renderer to place everything.
import { f32 } from '../../sdk/index.js';

export class IronDojoScroll {
    constructor() {
        this.worldW = f32(2048);
        this.lead = f32(44);                // px shown ahead of the fighter, in his facing direction
        this.ease = f32(5);                 // 1/s: how fast the camera catches its target
        this.camX = 0;                      // world x at screen x 0 (C# private set)
    }

    reset(worldW, focusX, facing) {
        this.worldW = f32(worldW);
        this.camX = this.clamp(this.target(focusX, facing));
    }

    // focusX - ScreenW / 2f + facing * Lead
    target(focusX, facing) { return f32(f32(focusX - 160) + f32(facing * this.lead)); }

    clamp(c) {
        const max = Math.max(0, f32(this.worldW - IronDojoScroll.ScreenW));
        return c < 0 ? 0 : c > max ? max : c;
    }

    follow(dt, focusX, facing) {
        const target = this.clamp(this.target(focusX, facing));
        const k = Math.min(1, f32(dt * this.ease));
        this.camX = this.clamp(f32(this.camX + f32(f32(target - this.camX) * k)));
    }

    // whole-pixel camera: every layer scrolls by the same integer, so nothing shimmers
    get camPx() { return Math.floor(f32(this.camX + 0.5)); }

    toScreen(worldX) { return Math.floor(f32(worldX + 0.5)) - this.camPx; }

    // a layer at depth `factor` (1 = the floor's own plane, <1 = further away)
    toScreenParallax(worldX, factor) { return Math.floor(f32(f32(worldX - f32(this.camPx * f32(factor))) + 0.5)); }

    get leftEdge() { return f32(this.camX + IronDojoScroll.ViewLeft); }
    get rightEdge() { return f32(this.camX + IronDojoScroll.ViewRight); }

    onScreen(worldX, margin = 0) {
        margin = f32(margin);
        return worldX >= f32(this.leftEdge - margin) && worldX <= f32(this.rightEdge + margin);
    }
}

IronDojoScroll.ScreenW = 320;
IronDojoScroll.ViewLeft = 8;
IronDojoScroll.ViewRight = 312;
