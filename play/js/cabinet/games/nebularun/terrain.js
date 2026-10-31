// THE NODE · world 1 · NEBULA RUN on the Cabinet Engine · THE GROUND ART (a helper of the renderer: picture only).
//
// Each sector's ground is a pure function of MAP position: features are hashed from fixed map slots, so they scroll
// smoothly with the ground and never resample, and the renderer never touches the sim's dice. Drawn in spans (rect
// rows), never per pixel, so a whole field costs a few hundred fills.
//
//   shoals     the nebula sea (void) with drifting wave dashes and teal SANDBARS; the targets stand on islands
//   craters    purple crater ground: lit rims, dark bowls, scattered rock; concrete pads, steel roads for the armour
//   city       the CITY OF GLASS: towers of steel and lit glass in blocks; plazas under the targets, domes
//   storm      a dark ground under rolling cloud banks and slanting rain (the rain is the only thing here that moves on
//              its own clock: the frame time, never the dice)
//   fortress   the Mother Fortress's armour plate: panels, seams, rivets, vents and trenches
// Sites (the sim's pads under each group) and the bosses' ground plates are drawn here too, in the sector's style.
import { NebulaScroll } from './scroll.js';

const FX = NebulaScroll.FieldX, FY = NebulaScroll.FieldY, FW = NebulaScroll.FieldW, FH = NebulaScroll.FieldH;
const FB = NebulaScroll.FieldBottom, FR = NebulaScroll.FieldRight;

// a small avalanche hash: a pure function of position, never the dice
export function hash(n) {
    let h = Math.imul(n | 0, 0x9E3779B1) >>> 0;
    h = (h ^ (h >>> 15)) >>> 0; h = Math.imul(h, 0x85EBCA77) >>> 0;
    h = (h ^ (h >>> 13)) >>> 0; h = Math.imul(h, 0xC2B2AE3D) >>> 0;
    return (h ^ (h >>> 16)) >>> 0;
}

// a filled ellipse as row spans
export function ellipse(s, cx, cy, rx, ry, c) {
    cx = Math.round(cx); cy = Math.round(cy);
    if (rx < 1 || ry < 1) { s.setPixel(cx, cy, c); return; }
    const iry = Math.round(ry);
    for (let dy = -iry; dy <= iry; dy++) {
        const u = dy / ry, hw = Math.round(rx * Math.sqrt(Math.max(0, 1 - u * u)));
        s.rect(cx - hw, cy + dy, 2 * hw + 1, 1, c);
    }
}

// a ring as dots every `step` radians (a dotted dome, a marker): squashed by `sq` for the tube's ground plane
export function dotRing(s, cx, cy, rad, n, c, phase = 0, sq = 1) {
    for (let k = 0; k < n; k++) {
        const a = phase + k / n * Math.PI * 2;
        s.setPixel(Math.round(cx + Math.cos(a) * rad), Math.round(cy + Math.sin(a) * rad * sq), c);
    }
}

export class Terrain {
    constructor(c) { this.c = c; }

    // the ground under everything; ox/oy is the shake
    draw(s, r, t, ox, oy) {
        switch (r.def.ground) {
            case 'shoals': this._shoals(s, r, ox, oy); break;
            case 'craters': this._craters(s, r, ox, oy); break;
            case 'city': this._city(s, r, ox, oy); break;
            case 'storm': this._storm(s, r, t, ox, oy); break;
            default: this._fortress(s, r, ox, oy); break;
        }
    }

    // map slots of `size` px overlapping the field (with a margin for tall features)
    _slots(r, size, margin, fn) {
        const sc = r.scroll;
        const lo = Math.floor((sc.pos - margin) / size), hi = Math.floor((sc.pos + FH + margin) / size);
        for (let k = lo; k <= hi; k++) fn(k, Math.round(sc.toScreenY(k * size)));   // whole rows: rect() wants integers
    }

    // ------------------------------------------------------------------ 1 THE SHOALS
    _shoals(s, r, ox, oy) {
        const c = this.c;
        this._slots(r, 12, 4, (k, y0) => {
            const h = hash(k * 7 + 11);
            if (h % 3 === 0) return;
            const x = FX + (h >>> 4) % (FW - 12), y = y0 - ((h >>> 12) % 12), len = 3 + (h >>> 16) % 8;
            s.rect(x + ox, y + oy, len, 1, c.nebDeep);
            if ((h >>> 20) % 4 === 0) s.rect(x + ox + len + 3, y + oy, 2, 1, c.nebDeep);
        });
        this._slots(r, 44, 30, (k, y0) => {
            const h = hash(k * 13 + 5);
            if (h % 5 < 2) return;
            const cx = FX + 16 + (h >>> 3) % (FW - 32), cy = y0 - ((h >>> 9) % 40);
            const rx = 12 + (h >>> 14) % 26, ry = 4 + (h >>> 19) % 6;
            this._sandbar(s, cx + ox, cy + oy, rx, ry);
        });
    }

    _sandbar(s, cx, cy, rx, ry) {
        const c = this.c;
        ellipse(s, cx, cy, rx + 2, ry + 1, c.nebDeep);            // the shallows
        ellipse(s, cx, cy, rx, ry, c.teal);                        // the lit edge
        ellipse(s, cx + 1, cy + 1, rx - 1, ry - 1, c.tealDeep);
        for (let x = -rx + 3; x < rx - 3; x += 5) s.setPixel(Math.round(cx + x), Math.round(cy - ry - 2), c.tealDeep);   // foam
    }

    // ------------------------------------------------------------------ 2 THE CRATER BELT
    _craters(s, r, ox, oy) {
        const c = this.c;
        s.rect(FX, FY, FW, FH, c.nebDeep);
        this._slots(r, 14, 4, (k, y0) => {                        // rock and grit
            const h = hash(k * 5 + 77);
            for (let j = 0; j < 3; j++) {
                const hj = hash(h + j);
                const x = FX + hj % FW, y = y0 - (hj >>> 12) % 14;
                s.setPixel(x + ox, y + oy, (hj >>> 20) % 3 === 0 ? c.neb : c.void);
            }
        });
        this._slots(r, 38, 26, (k, y0) => {
            const h = hash(k * 31 + 3);
            const n = 1 + h % 2;
            for (let j = 0; j < n; j++) {
                const hj = hash(h + j * 17);
                const cx = FX + 10 + hj % (FW - 20), cy = y0 - (hj >>> 10) % 38, rad = 5 + (hj >>> 16) % 14;
                this._crater(s, cx + ox, cy + oy, rad);
            }
        });
    }

    _crater(s, cx, cy, rad) {
        const c = this.c;
        ellipse(s, cx, cy, rad + 1, rad * 0.7 + 1, c.neb);         // the rim, lit
        ellipse(s, cx + 1, cy + 1, rad - 1, rad * 0.7 - 1, c.void); // the bowl
        if (rad > 9) ellipse(s, cx + 2, cy + 2, rad * 0.45, rad * 0.3, c.nebDeep);
        s.setPixel(Math.round(cx - rad * 0.6), Math.round(cy - rad * 0.45), c.nebHi);
    }

    // ------------------------------------------------------------------ 3 THE CITY OF GLASS
    _city(s, r, ox, oy) {
        const c = this.c;
        this._slots(r, 46, 40, (k, y0) => {
            const h = hash(k * 19 + 1);
            // a street across the block
            s.rect(FX, y0 + oy, FW, 1, c.steelDeep);
            let x = FX + 2 + (h % 14);
            let j = 0;
            while (x < FR - 10) {
                const hj = hash(h + j * 29 + 7); j++;
                const w = 12 + hj % 20, d = 10 + (hj >>> 6) % 18, tall = 3 + (hj >>> 11) % 6;
                if ((hj >>> 17) % 5 !== 0) this._tower(s, x + ox, y0 - 6 - ((hj >>> 20) % 10) + oy, w, d, tall, hj);
                x += w + 6 + (hj >>> 24) % 14;
            }
        });
    }

    // a glass tower seen from above and a little south: the roof, then its south face with lit windows
    _tower(s, x, yb, w, d, tall, h) {
        const c = this.c;
        const top = yb - d - tall;
        s.rect(x, top, w, d, c.steel);                              // the roof
        s.rect(x, top, w, 1, c.steelHi);
        s.rect(x, top + d, w, tall, c.steelDeep);                   // the south face
        for (let wy = top + d + 1; wy < top + d + tall - 1; wy += 2)
            for (let wx = x + 1; wx < x + w - 1; wx += 3)
                if (((wx * 7 + wy * 13 + h) & 3) !== 0) s.setPixel(wx, wy, c.cyanDim);
        if ((h & 7) === 0) s.setPixel(x + (w >> 1), top + (d >> 1), c.cyan);    // a beacon light on the roof
    }

    // ------------------------------------------------------------------ 4 THE STORM
    _storm(s, r, t, ox, oy) {
        const c = this.c;
        this._slots(r, 26, 12, (k, y0) => {                       // the ground glimpsed through it
            const h = hash(k * 11 + 41);
            if (h % 3 === 0) return;
            const cx = FX + h % FW, cy = y0 - (h >>> 8) % 26;
            ellipse(s, cx + ox, cy + oy, 10 + (h >>> 14) % 22, 3 + (h >>> 20) % 4, c.tealDeep);
        });
        this._slots(r, 34, 20, (k, y0) => {                       // the cloud banks
            const h = hash(k * 23 + 9);
            const n = 1 + h % 2;
            for (let j = 0; j < n; j++) {
                const hj = hash(h + j * 5);
                const cx = FX + hj % FW, cy = y0 - (hj >>> 9) % 34, rx = 26 + (hj >>> 14) % 46, ry = 4 + (hj >>> 20) % 5;
                ellipse(s, cx + ox, cy + oy, rx, ry, c.neb);
                ellipse(s, cx + ox + 2, cy + oy + 1, rx - 2, ry - 1, c.nebDeep);
            }
        });
        // the rain: slanting streaks on the frame clock
        for (let k = 0; k < 46; k++) {
            const h = hash(k * 97 + 3);
            const x = FX + ((h % FW) + Math.trunc(t * 34)) % FW;
            const y = FY + (((h >>> 10) % FH) + Math.trunc(t * 170)) % FH;
            s.setPixel(x, y, c.cyanDim); s.setPixel(x - 1, y + 1, c.cyanDim); s.setPixel(x - 1, y + 2, c.nebDeep);
        }
    }

    // ------------------------------------------------------------------ 5 THE MOTHER FORTRESS (the approach)
    _fortress(s, r, ox, oy) {
        const c = this.c;
        s.rect(FX, FY, FW, FH, c.steelDeep);
        const PW = 38;
        this._slots(r, 26, 4, (k, y0) => {
            const yy = y0 + oy;
            s.rect(FX, yy, FW, 1, c.void);                          // the seam between plates
            for (let px = FX - 6 + (k & 1) * 19; px < FR; px += PW) {
                const h = hash(k * 131 + px * 7);
                const x = px + ox;
                s.rect(x, yy - 25, 1, 25, c.void);
                s.setPixel(x + 3, yy - 3, c.steel); s.setPixel(x + PW - 3, yy - 3, c.steel);
                s.setPixel(x + 3, yy - 22, c.steel); s.setPixel(x + PW - 3, yy - 22, c.steel);
                switch (h % 9) {
                    case 0: case 1:                                 // a vent
                        for (let v = 0; v < 3; v++) s.rect(x + 10, yy - 18 + v * 4, 18, 2, c.void);
                        s.rect(x + 10, yy - 17, 18, 1, (h >>> 8) % 3 === 0 ? c.redDim : c.void);
                        break;
                    case 2:                                         // a hatch
                        s.frame(x + 12, yy - 19, 14, 14, c.steel); s.rect(x + 13, yy - 18, 12, 1, c.steelHi);
                        break;
                    case 3:                                         // a trench
                        s.rect(x + 2, yy - 15, PW - 4, 6, c.void); s.rect(x + 2, yy - 15, PW - 4, 1, c.steel);
                        break;
                    case 4:                                         // hazard paint
                        for (let d = 0; d < 5; d++) s.rect(x + 8 + d * 5, yy - 12, 2, 2, c.ember);
                        break;
                    default:
                        s.rect(x + 6, yy - 20, PW - 12, 1, c.steel);
                        break;
                }
            }
        });
    }

    // ------------------------------------------------------------------ the sites (pads under the targets)
    // kind 0 a pad, 1 a road (tanks), 2 the radar isle's plate, 3 a flak pit, 4 a shield plaza, 5 a bunker plate,
    // 6 the crawler's crater floor, 7 the prism's plaza, 8 the storm's eye, 9 the mother's foundations
    site(s, r, site, ox, oy) {
        const c = this.c, g = r.def.ground;
        const y = Math.round(r.scroll.toScreenY(site.mapY)) + oy, x = Math.round(site.x) + ox;
        const hw = site.w / 2, hh = site.h / 2;
        if (y < FY - site.h || y > FB + site.h) return;
        const L = Math.round(x - hw), T = Math.round(y - hh), W = Math.round(site.w), H = Math.round(site.h);
        switch (site.kind) {
            case 1:                                                 // a road across the field
                if (g === 'shoals') { s.rect(FX, T + 3, FW, H - 6, c.tealDeep); s.rect(FX, T + 3, FW, 1, c.teal); s.rect(FX, T + H - 4, FW, 1, c.teal); }
                else {
                    s.rect(FX, T + 2, FW, H - 4, g === 'fortress' ? c.void : c.steelDeep);
                    s.rect(FX, T + 2, FW, 1, c.steel); s.rect(FX, T + H - 3, FW, 1, c.steel);
                    for (let rx = FX + 3; rx < FR; rx += 12) s.rect(rx, Math.round(y), 5, 1, c.steel);
                }
                return;
            case 2:                                                 // the radar isle
                this._sandbar(s, x, y, hw + 22, hh + 10);
                s.rect(L, T, W, H, c.steelDeep); s.frame(L, T, W, H, c.steel); s.frame(L + 2, T + 2, W - 4, H - 4, c.tealDeep);
                return;
            case 6:                                                 // the crawler's floor: a broad scorched trench
                s.rect(FX, T, FW, H, c.void);
                s.rect(FX, T, FW, 1, c.neb); s.rect(FX, T + H - 1, FW, 1, c.neb);
                for (let k = 0; k < 9; k++) { const h = hash(k + 501); s.rect(FX + h % FW, T + 4 + (h >>> 9) % (H - 8), 6 + (h >>> 15) % 10, 1, c.nebDeep); }
                return;
            case 7:                                                 // the prism's plaza
                s.rect(L, T, W, H, c.steelDeep); s.frame(L, T, W, H, c.cyanDim);
                s.frame(L + 3, T + 3, W - 6, H - 6, c.steel);
                return;
            case 8:                                                 // the eye of the storm: a clear calm patch
                ellipse(s, x, y, hw, hh * 0.6, c.nebDeep);
                ellipse(s, x, y, hw - 30, hh * 0.6 - 10, c.void);
                dotRing(s, x, y, hw - 40, 40, c.cyanDim, 0, 0.35);
                for (let k = 0; k < 3; k++) {                          // spiral arms: broken lit dashes round the wall
                    dotRing(s, x, y, hw - 6 - k * 9, 36 - k * 4, c.neb, k * 0.8, 0.6 * (1 - k * 0.04));
                    dotRing(s, x, y, hw - 2 - k * 9, 18, c.nebHi, k * 1.7, 0.6 * (1 - k * 0.04));
                }
                dotRing(s, x, y, hw - 22, 24, c.tealDeep, 0.4, 0.35);
                s.rect(Math.round(x) - 1, Math.round(y) - 1, 3, 3, c.cyanDim);   // the calm eye
                return;
            case 9:                                                 // the mother's foundations
                s.rect(L - 4, T - 4, W + 8, H + 8, c.void);
                return;
        }
        // the pads (0 plain, 3 flak pit, 4 shield plaza, 5 bunker plate), dressed for the sector
        if (g === 'shoals') {
            this._sandbar(s, x, y + 2, hw + 6, hh * 0.62 + 2);
            if (site.kind === 3) s.frame(L + 2, T + 4, W - 4, H - 8, c.tealDeep);
            return;
        }
        const fill = g === 'storm' ? c.tealDeep : g === 'city' ? c.void : g === 'fortress' ? c.steel : c.steelDeep;
        const rim = g === 'storm' ? c.teal : g === 'city' ? c.cyanDim : g === 'fortress' ? c.steelHi : c.steel;
        s.rect(L, T, W, H, fill);
        s.frame(L, T, W, H, rim);
        if (g === 'craters') {                                      // a concrete pad: lit top/left edge, shaded bottom/right, slab seams, corner bolts, hazard stripe
            s.rect(L, T, W, 1, c.steelHi); s.rect(L, T, 1, H, c.steelHi);
            s.rect(L, T + H - 1, W, 1, c.void); s.rect(L + W - 1, T, 1, H, c.void);
            s.rect(L + 2, T + 2, W - 4, H - 4, c.steelDeep);
            s.rect(L + Math.trunc(W / 2), T + 2, 1, H - 4, c.steel);
            s.rect(L + 2, T + Math.trunc(H / 2), W - 4, 1, c.steel);
            for (const [bx, by] of [[L + 2, T + 2], [L + W - 3, T + 2], [L + 2, T + H - 3], [L + W - 3, T + H - 3]]) s.rect(bx, by, 1, 1, c.steelHi);
            for (let k = L + 4; k < L + W - 6; k += 8) { s.rect(k, T + H - 5, 4, 1, c.ember); }
            s.rect(L + 3, T + H, W - 4, 2, c.void);                  // a cast shadow
        }
        if (site.kind === 3) { s.frame(L + 3, T + 3, W - 6, H - 6, c.void); }
        if (site.kind === 4) { s.frame(L + 2, T + 2, W - 4, H - 4, c.steelDeep); dotRing(s, x, y, Math.min(hw, hh) - 4, 18, rim, 0, 0.9); }
        if (site.kind === 5) { s.rect(L, T + H - 3, W, 3, c.steelDeep); for (let k = L + 3; k < L + W - 3; k += 6) s.rect(k, T + H - 2, 3, 1, c.ember); }
    }
}
