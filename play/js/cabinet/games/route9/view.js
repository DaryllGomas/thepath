// THE NODE · world 1 · ROUTE 9 · THE SCROLL: the street plane sheared onto the tube.
// Port of Route9View.cs.
//
//   screen y = Y0 - (s - CamS)                  one row per px of S: the street scrolls DOWN
//   screen x = X0 + l + (s/2 - CamS/2)          half a px right per row up: the street LEANS right
//
// So the street runs bottom-left to top-right and the whole world slides down-left as the bike
// rolls. Every screen row is ONE cross-section of the street at one S, which is how the ground is
// painted (a row at a time, like a 1985 line buffer). The half-step shear is taken from ABSOLUTE
// s (floor(s/2)), so the stair-steps of every curb are nailed to the ground and slide with it
// instead of crawling.
//
// Two ways to put a sprite down:
//   Ground   flat things (houses seen from above, potholes, cars, crosswalks): authored in (L, S)
//            space, column = L, row 0 = the FAR end (highest S); each row is sheared with the street
//   Upright  standing things (the bike, a dog, a mailbox, a tree): drawn square to the tube with
//            the bottom-centre on their ground point, the way every oblique arcade game did it
import { roundEven } from '../../sdk/index.js';

export const Left = 8, Top = 32, Right = 312, Bottom = 232;   // the playfield (right/bottom exclusive)
export const Y0 = Bottom - 1;                                  // the screen row of S = CamS
export const X0 = -12;                                         // screen x of L = 0 at S = CamS
export const BikeRow = 36;                                     // the bike rides this many rows up from the bottom

export function floorI(v) { return Math.floor(v); }
export function floorDiv(a, b) { let q = Math.trunc(a / b); if (a % b !== 0 && (a < 0) !== (b < 0)) q--; return q; }

export class Route9View {
    constructor(camS) { this.camS = camS; }

    static follow(bikeS) { return new Route9View(floorI(bikeS) - BikeRow); }

    rowS(y) { return this.camS + (Y0 - y); }
    y(s) { return Y0 - (floorI(s) - this.camS); }
    shift(s) { return floorDiv(s, 2) - floorDiv(this.camS, 2); }
    x(s, l) { return X0 + floorI(l) + this.shift(floorI(s)); }
    rowX(s) { return X0 + this.shift(s); }                    // screen x of L = 0 on the row of s

    get farS() { return this.rowS(Top); }
    get nearS() { return this.rowS(Bottom - 1); }

    // ------------------------------------------------------------ drawing
    // a ground sprite whose NEAR row (the bottom row) sits at world sNear and whose column 0 is at l0.
    // map: sprite index -> colour (placeholders above the palette are how a house changes paint)
    ground(g, spr, sNear, l0, map, flipRows = false, flipCols = false) {
        const sN = floorI(sNear), l = floorI(l0);
        for (let j = 0; j < spr.height; j++) {
            const s = sN + (spr.height - 1 - j);
            const y = this.y(s);
            if (y < Top || y >= Bottom) continue;
            const x0 = X0 + l + this.shift(s);
            const sj = flipRows ? spr.height - 1 - j : j;
            for (let i = 0; i < spr.width; i++) {
                const v = spr.at(flipCols ? spr.width - 1 - i : i, sj);
                if (v < 0 || v >= map.length) continue;
                g.setPixel(x0 + i, y, map[v]);
            }
        }
    }

    // an upright sprite standing on (s, l): bottom-centre on the ground point
    upright(g, spr, s, l, map, flipX = false, lift = 0) {
        const ax = this.x(s, l), ay = this.y(s) - lift;
        const x0 = ax - Math.trunc(spr.width / 2), y0 = ay - spr.height + 1;
        for (let j = 0; j < spr.height; j++)
            for (let i = 0; i < spr.width; i++) {
                const v = spr.at(flipX ? spr.width - 1 - i : i, j);
                if (v < 0 || v >= map.length) continue;
                g.setPixel(x0 + i, y0 + j, map[v]);
            }
    }

    // a flat ellipse of ground (shadows, light pools), sheared with the street; dither = checker
    groundEllipse(g, s, l, rl, rs, c, dither) {
        const sc = floorI(s), lc = floorI(l);
        for (let ds = -rs; ds <= rs; ds++) {
            const f = 1 - (ds * ds) / ((rs + 0.5) * (rs + 0.5));
            if (f <= 0) continue;
            const half = roundEven(rl * Math.sqrt(f));
            const y = this.y(sc + ds);
            if (y < Top || y >= Bottom) continue;
            const x = X0 + lc + this.shift(sc + ds);
            for (let dl = -half; dl <= half; dl++) {
                if (dither && ((lc + dl + sc + ds) & 1) !== 0) continue;     // the checker is nailed to the ground
                g.setPixel(x + dl, y, c);
            }
        }
    }
}
