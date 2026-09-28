// THE NODE · world 1 · WARLORD'S ROAD · THE RIG: every character is a costume on a posed skeleton.
//
// A pose is a handful of numbers in "hero units" (facing RIGHT, the ground point at (0,0), y DOWN): the
// hip, the lean of the spine, where the hands and feet are, the angle of the weapon. Two-bone IK finds the
// knees and elbows. A costume says what is worn (skin, trunks, vest, plate, helm, hair, cape) and carried
// (sword, club, axe, hammer, great-axe, great-sword, shield, sack) and how big (scale). The builders turn
// pose + costume into primitives and raster.js turns those into an outlined, shaded sprite.
//
// sprite(costumeId, poseName) is cached: each frame is built once, on first use, then only blitted.
// The lizard mount has its own builder (a beaked, two-legged lizard with a clubbed tail).
import { C, Ramp } from './palette.js';
import { raster, scalePrims, cap, ell, poly, blade } from './raster.js';

const D2R = Math.PI / 180;
export const SCALE = 1.1;          // every sprite, over its costume's own scale

// layers, back to front
const G = { cape: 1, backArm: 2, backWeapon: 3, hairBack: 4, backLeg: 5, torso: 6, frontLeg: 7, kilt: 8, head: 9, shield: 10, weapon: 11, frontArm: 12, pauldron: 13 };

function ik(root, target, l1, l2, bend) {
    let dx = target[0] - root[0], dy = target[1] - root[1];
    let d = Math.hypot(dx, dy);
    const maxd = (l1 + l2) * 0.995, mind = Math.abs(l1 - l2) + 0.5;
    if (d > maxd) { dx *= maxd / d; dy *= maxd / d; d = maxd; }
    if (d < mind) { const k = mind / Math.max(0.001, d); dx *= k; dy *= k; d = mind; }
    const a = Math.atan2(dy, dx);
    const A = Math.acos(Math.max(-1, Math.min(1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d))));
    const ja = a + bend * A;
    return [[root[0] + Math.cos(ja) * l1, root[1] + Math.sin(ja) * l1], [root[0] + dx, root[1] + dy]];
}

const lerp2 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

// ------------------------------------------------------------------ weapons
function weapon(P, M, kind, H, wDeg, g) {
    const w = wDeg * D2R, dx = Math.cos(w), dy = Math.sin(w), nx = -dy, ny = dx;
    const at = (a, n = 0) => [H[0] + dx * a + nx * n, H[1] + dy * a + ny * n];
    const capA = (a0, a1, r0, r1, ramp, n0 = 0, n1 = 0) => { const p = at(a0, n0), q = at(a1, n1); P.push(cap(p[0], p[1], q[0], q[1], r0, r1, ramp, g)); };
    if (kind === 'sword' || kind === 'greatsword' || kind === 'rustsword') {
        const big = kind === 'greatsword', rust = kind === 'rustsword';
        const len = big ? 44 : rust ? 25 : 34, hw = big ? 2.9 : rust ? 1.9 : 2.4, guard = big ? 5.6 : rust ? 3.4 : 4.6;
        const pm = at(big ? -6.5 : -4.2);
        P.push(ell(pm[0], pm[1], 1.7, 1.7, 0, rust ? Ramp.rust : Ramp.gold, g));
        capA(big ? -6 : -3.8, 2.6, 1.3, 1.3, Ramp.leather);
        capA(3.2, 3.2, 1.3, 1.3, rust ? Ramp.rust : Ramp.gold, -guard, guard);
        const b0 = at(3.9), b1 = at(len);
        P.push(blade(b0[0], b0[1], b1[0], b1[1], hw, rust ? Ramp.rust : Ramp.steel, g, big ? 0.22 : 0.28));
        if (big) { const gm = at(3.2); M.push([gm[0], gm[1], C.red]); }
        if (rust) { for (const a of [9, 15, 20]) { const q = at(a, 0.6); M.push([q[0], q[1], C.dirtDk]); } }
    } else if (kind === 'club') {
        capA(-3, 21, 1.5, 3.9, Ramp.leather);
        for (const [a, n] of [[12, 3], [16, -3.6], [19, 3.4], [21.5, -1.5], [9, -2.8]]) {
            const q = at(a, n), r = at(a, n * 1.45);
            M.push([q[0], q[1], C.steelHi, r[0], r[1]]);
        }
        const q = at(22.5, 0); P.push(cap(q[0], q[1], q[0], q[1], 1.2, 1.2, Ramp.steel, g));
    } else if (kind === 'axe' || kind === 'greataxe') {
        const big = kind === 'greataxe';
        const L = big ? 34 : 25;
        capA(-6, L + 1, 1.4, 1.4, Ramp.leather);
        const h0 = L - (big ? 11 : 8), h1 = L - 1;
        const ext = big ? 12 : 9;
        P.push(poly([at(h0, 1.2), at(h1, 1.2), at(h1 + 3, -ext), at((h0 + h1) / 2, -ext * 0.55), at(h0 - 3, -ext)], Ramp.steel, g, 2));
        const e0 = at(h1 + 2.6, -ext + 0.6), e1 = at(h0 - 2.6, -ext + 0.6);
        M.push([e0[0], e0[1], C.steelHi, e1[0], e1[1]]);
        if (big) P.push(poly([at(h0 + 2, 1), at(h1 - 2, 1), at(h1, 7), at(h0, 7)], Ramp.steel, g, 1));
    } else if (kind === 'hammer') {
        capA(-7, 28, 1.6, 1.6, Ramp.leather);
        P.push(poly([at(23, -8), at(32, -8), at(32, 8), at(23, 8)], Ramp.dark, g, 2));
        for (const n of [-6, -2, 2, 6]) { const q = at(32.5, n); M.push([q[0], q[1], C.steelHi]); }
        const b0 = at(22.5, -8), b1 = at(22.5, 8); M.push([b0[0], b0[1], C.gold, b1[0], b1[1]]);
        const s0 = at(27.5, -8.5), s1 = at(27.5, -11.5); P.push(cap(s0[0], s0[1], s1[0], s1[1], 1.4, 0.5, Ramp.steel, g));
        const t0 = at(27.5, 8.5), t1 = at(27.5, 11.5); P.push(cap(t0[0], t0[1], t1[0], t1[1], 1.4, 0.5, Ramp.steel, g));
    }
}

// ------------------------------------------------------------------ the humanoid
function humanoid(pose, cz) {
    const P = [], M = [];
    const b = cz.build || {};
    const TL = b.torso || 17, TH = b.thigh || 13, SH = b.shin || 13.5, UA = b.upper || 10, FA = b.fore || 9.5;
    const girth = b.girth || 1, limb = b.limb || 1;
    const hip = pose.hip, lean = (pose.lean || 0) * D2R;
    const ux = Math.sin(lean), uy = -Math.cos(lean), px = -uy, py = ux;
    const at = (t, l) => [hip[0] + ux * TL * t + px * l, hip[1] + uy * TL * t + py * l];
    const neck = at(1, 0.4);
    const shF = at(0.8, 0.6), shB = at(0.8, -2.8);
    const hipF = [hip[0] + 1.6, hip[1] + 0.4], hipB = [hip[0] - 1.8, hip[1] + 0.4];
    const skel = !!cz.skeleton;

    // head frame
    const hRot = ((pose.lean || 0) * 0.35 + (pose.head || 0)) * D2R;
    const hc = [neck[0] + ux * 6.0 + px * 1.3, neck[1] + uy * 6.0 + py * 1.3];
    const hcs = Math.cos(hRot), hsn = Math.sin(hRot);
    const R = (x, y) => [hc[0] + x * hcs - y * hsn, hc[1] + x * hsn + y * hcs];
    const hDeg = hRot / D2R;

    // limbs
    const [kneeF, ankF] = ik(hipF, pose.ff, TH, SH, -1);
    const [kneeB, ankB] = ik(hipB, pose.bf, TH, SH, -1);
    const [elbF, wriF] = ik(shF, pose.fh, UA, FA, pose.ef || 1);
    const [elbB, wriB] = ik(shB, pose.bh, UA, FA, pose.eb || 1);

    const r = (v) => v * limb;
    const leg = (hj, kn, an, g, sh) => {
        const thighR = cz.thigh || cz.skin, shinR = cz.shin || cz.skin, bootR = cz.boot || cz.skin;
        if (skel) {
            P.push(cap(hj[0], hj[1], kn[0], kn[1], 1.9, 1.7, Ramp.bone, g, sh));
            P.push(cap(kn[0], kn[1], an[0], an[1], 1.7, 1.5, Ramp.bone, g, sh));
            P.push(cap(an[0], an[1], an[0] + 4.2, an[1] + 0.6, 1.5, 1.2, Ramp.bone, g, sh));
            return;
        }
        P.push(cap(hj[0], hj[1], kn[0], kn[1], r(4.4), r(3.4), thighR, g, sh));
        if (cz.trunks) { const q = lerp2(hj, kn, 0.38); P.push(cap(hj[0], hj[1], q[0], q[1], r(4.8), r(4.3), cz.trunks, g, sh)); }
        P.push(cap(kn[0], kn[1], an[0], an[1], r(3.3), r(2.5), shinR, g, sh));
        const m = lerp2(kn, an, 0.4);
        P.push(cap(m[0], m[1], an[0], an[1], r(3.4), r(3.1), bootR, g, sh));
        P.push(cap(an[0] - 0.6, an[1] + 0.2, an[0] + 4.8, an[1] + 0.9, r(2.6), r(2.2), bootR, g, sh));
        if (cz.cuff) { const c2 = lerp2(kn, an, 0.52); P.push(cap(m[0], m[1], c2[0], c2[1], r(3.9), r(3.7), cz.cuff, g, sh)); }
        if (cz.greaves) P.push(cap(kn[0], kn[1], kn[0], kn[1], r(2.9), r(2.9), cz.greaves, g, sh));
    };
    const arm = (sh, el, wr, g, shift, back) => {
        const upR = cz.upper || cz.skin, foreR = cz.fore || cz.skin;
        if (skel) {
            P.push(cap(sh[0], sh[1], el[0], el[1], 1.7, 1.5, Ramp.bone, g, shift));
            P.push(cap(el[0], el[1], wr[0], wr[1], 1.5, 1.4, Ramp.bone, g, shift));
            P.push(ell(wr[0], wr[1], 1.9, 1.9, 0, Ramp.bone, g, shift));
            return;
        }
        const th = back ? 0.88 : 1;
        P.push(cap(sh[0], sh[1], el[0], el[1], r(3.6) * th, r(2.9) * th, upR, g, shift));
        P.push(cap(el[0], el[1], wr[0], wr[1], r(2.9) * th, r(2.5) * th, foreR, g, shift));
        const br = back ? cz.bracerB || cz.bracer : cz.bracer;
        if (br) { const q = lerp2(el, wr, 0.42); P.push(cap(q[0], q[1], wr[0], wr[1], r(3.1), r(2.9), br, g, shift)); }
        P.push(ell(wr[0], wr[1], r(2.8), r(2.7), 0, cz.fist || cz.skin, g, shift));
    };

    // ---- cape (behind everything)
    if (cz.cape) {
        const fl = pose.cape || 0;
        const a = [shB[0] - 0.5, shB[1] - 1.2], bb = at(0.98, 2.5);
        P.push(poly([a, bb, [hip[0] - 1 - fl * 3, hip[1] + 23], [hip[0] - 15 - fl * 9, hip[1] + 20 - fl * 4], [hip[0] - 10 - fl * 5, hip[1] + 4]], cz.cape, G.cape, 1));
    }
    // ---- back arm, back weapon, sack, hair
    arm(shB, elbB, wriB, G.backArm, 1, true);
    if (cz.sack) {
        P.push(ell(wriB[0] - 5.5, wriB[1] + 4, 7, 7.8, 12, Ramp.leather, G.backWeapon));
        M.push([wriB[0] - 1.5, wriB[1] - 0.5, C.leatherLo, wriB[0] - 3.5, wriB[1] + 1.5]);
        M.push([wriB[0] - 8, wriB[1] + 2, C.leatherHi, wriB[0] - 7, wriB[1] + 7]);
    }
    if (cz.weapon && pose.wl === 'back') weapon(P, M, cz.weapon, pose.fh2 || wriF, pose.w, G.backWeapon);
    if (cz.hair === 'mane') {
        const q = R(-3.4, 3.0);
        P.push(ell(q[0], q[1], 3.0, 5.4, hDeg + 24, cz.hairRamp || Ramp.hair, G.hairBack));
        const s0 = R(-3.8, 1.2), s1 = R(-9, 6 + (pose.hairFly || 0));
        P.push(cap(s0[0], s0[1], s1[0], s1[1], 2.2, 0.9, cz.hairRamp || Ramp.hair, G.hairBack));
    }
    // ---- back leg, torso, front leg
    leg(hipB, kneeB, ankB, G.backLeg, 1);
    const chestR = cz.chest || cz.skin, bellyR = cz.belly || cz.chest || cz.skin, pelvisR = cz.pelvis || cz.trunks || cz.skin;
    if (skel) {
        const n0 = at(0, 0), n1 = at(1, 0);
        P.push(cap(n0[0], n0[1], n1[0], n1[1], 1.5, 1.4, Ramp.bone, G.torso));
        const cc = at(0.64, 0.8);
        P.push(ell(cc[0], cc[1], 5.4, 5.9, pose.lean || 0, Ramp.bone, G.torso));
        for (let k = -3; k <= 3; k += 2) {
            const a = at(0.64 + k * 0.055, -4.4), bq = at(0.64 + k * 0.055, 5.2);
            M.push([a[0], a[1], C.ink, bq[0], bq[1]]);
        }
        const pc = at(0.04, 0); P.push(ell(pc[0], pc[1], 4.6, 3, pose.lean || 0, Ramp.bone, G.torso));
        const pe = at(0.04, 1.2); M.push([pe[0], pe[1], C.ink]);
    } else {
        const nk0 = at(0.86, 0.9);
        P.push(cap(nk0[0], nk0[1], neck[0] + px * 0.8, neck[1] + py * 0.8, 3.0 * girth, 2.7 * girth, cz.skin, G.torso));
        const pc = at(0.03, 0), bc = at(0.33, 0.6), cc = at(0.66, 0.5);
        P.push(ell(pc[0], pc[1], 6.5 * girth, 4.5, pose.lean || 0, pelvisR, G.torso));
        P.push(ell(bc[0], bc[1], 6.1 * girth, 5.9, pose.lean || 0, bellyR, G.torso));
        P.push(ell(cc[0], cc[1], 7.6 * girth, 7.0, pose.lean || 0, chestR, G.torso));
        if (cz.torsoStyle === 'bare') {
            const a = at(0.52, -1.2), bq = at(0.5, 6.4 * girth); M.push([a[0], a[1], C.skinLo, bq[0], bq[1]]);
            const c1 = at(0.36, 2.4), c2 = at(0.36, 5.2); M.push([c1[0], c1[1], C.skinLo, c2[0], c2[1]]);
            const c3 = at(0.22, 2.6), c4 = at(0.22, 5.0); M.push([c3[0], c3[1], C.skinLo, c4[0], c4[1]]);
        } else if (cz.torsoStyle === 'vest') {
            for (const [t, l] of [[0.72, 3], [0.6, 5.4], [0.45, 4.4], [0.3, 4.8], [0.76, -2.5]]) { const q = at(t, l * girth); M.push([q[0], q[1], C.steel]); }
            const f0 = at(0.92, -5), f1 = at(0.94, 4.2);
            P.push(cap(f0[0], f0[1], f1[0], f1[1], 2.6, 2.4, Ramp.fur, G.torso));
        } else if (cz.torsoStyle === 'plate') {
            const a = at(0.5, -5 * girth), bq = at(0.5, 6.5 * girth); M.push([a[0], a[1], cz.trim || C.steelLo, bq[0], bq[1]]);
            const c1 = at(0.78, -4), c2 = at(0.78, 6.4 * girth); M.push([c1[0], c1[1], cz.trim || C.steelLo, c2[0], c2[1]]);
            const d1 = at(0.67, 4), d2 = at(0.6, 2); M.push([d1[0], d1[1], C.steelHi, d2[0], d2[1]]);
        } else if (cz.torsoStyle === 'tunic') {
            const a = at(0.7, 5), bq = at(0.2, 5.5); M.push([a[0], a[1], cz.chest[1], bq[0], bq[1]]);
        }
    }
    leg(hipF, kneeF, ankF, G.frontLeg, 0);
    // ---- belt, loin, tabard
    if (!skel) {
        const bc = at(0.12, 0.3);
        P.push(ell(bc[0], bc[1], 6.9 * girth, 1.7, pose.lean || 0, cz.belt || Ramp.leather, G.kilt));
        const bk = at(0.12, 6.4 * girth); M.push([bk[0], bk[1], C.hud]); M.push([bk[0], bk[1] + 1, C.gold]);
        if (cz.loin) {
            const a = at(0.08, 3.4), bq = at(0.08, 7.4);
            P.push(poly([a, bq, [bq[0] + 1.5, hip[1] + 10.5], [a[0] + 0.5, hip[1] + 11.5]], cz.loin, G.kilt, 2));
        }
        if (cz.tabard) {
            const a = at(0.1, -6.5 * girth), bq = at(0.1, 6.8 * girth);
            P.push(poly([a, bq, [hip[0] + 8 * girth, hip[1] + 12], [hip[0] - 7 * girth, hip[1] + 12]], cz.tabard, G.kilt, 2));
            const e0 = [hip[0] - 6.5 * girth, hip[1] + 11.4], e1 = [hip[0] + 7.5 * girth, hip[1] + 11.4];
            M.push([e0[0], e0[1], cz.tabardEdge || C.gold, e1[0], e1[1]]);
        }
    }
    // ---- head
    const headR = cz.headRamp || (skel ? Ramp.bone : cz.skin);
    P.push(ell(hc[0], hc[1], 4.5, 5.1, hDeg, headR, G.head));
    const j0 = R(-0.2, 1.8), j1 = R(2.6, 3.3);
    P.push(cap(j0[0], j0[1], j1[0], j1[1], skel ? 2.0 : 2.6, skel ? 1.8 : 2.3, headR, G.head));
    if (!skel && cz.face !== 'hood' && cz.helm !== 'thief') { const n = R(4.3, 0.4); P.push(ell(n[0], n[1], 1.3, 1.5, hDeg, headR, G.head)); }
    // face
    if (skel) {
        for (const [x, y] of [[1.8, -0.9], [2.8, -0.9], [1.8, 0.1], [2.8, 0.1]]) { const q = R(x, y); M.push([q[0], q[1], C.ink]); }
        const n = R(4, 1.3); M.push([n[0], n[1], C.ink]);
        const t0 = R(1.2, 3.1), t1 = R(3.8, 3.1); M.push([t0[0], t0[1], C.ink, t1[0], t1[1]]);
        const e = R(2.3, -0.4); M.push([e[0], e[1], C.red]);
    } else if (cz.helm !== 'hood' && cz.helm !== 'thief' && cz.helm !== 'warlord') {
        const e = R(2.5, -0.7); M.push([e[0], e[1], C.ink]);
        const e2 = R(2.5, -1.7); M.push([e2[0], e2[1], cz.face === 'hero' ? C.hairLo : C.ink]);
        const b0 = R(1.2, -2.2), b1 = R(4.0, -1.5); M.push([b0[0], b0[1], cz.face === 'hero' ? C.hairLo : C.ink, b1[0], b1[1]]);
        const m0 = R(3.0, 3.0), m1 = R(4.1, 2.7); M.push([m0[0], m0[1], cz.skin[0], m1[0], m1[1]]);
        const ear = R(-1.3, 0.4); M.push([ear[0], ear[1], cz.skin[1]]);
    }
    if (cz.beard) {
        const q = R(2.2, 4.6); P.push(ell(q[0], q[1], 3.3, 3.2, hDeg, cz.beard, G.head));
        const q2 = R(-0.4, 3.2); P.push(ell(q2[0], q2[1], 2.4, 2.6, hDeg, cz.beard, G.head));
    }
    // hair / helm
    if (cz.hair === 'mane') {
        const hr = cz.hairRamp || Ramp.hair;
        const t = R(-0.9, -2.9); P.push(ell(t[0], t[1], 5.1, 3.3, hDeg - 8, hr, G.head));
        const s = R(-2.8, -0.2); P.push(ell(s[0], s[1], 2.8, 4.8, hDeg + 10, hr, G.head));
        const h0 = R(-4.6, -1.9), h1 = R(3.8, -2.9); M.push([h0[0], h0[1], C.red, h1[0], h1[1]]);
        const h2 = R(-4.4, -1.1), h3 = R(3.6, -2.1); M.push([h2[0], h2[1], C.redLo, h3[0], h3[1]]);
    }
    if (cz.helm === 'horned') {
        const d = R(-0.4, -2.5); P.push(ell(d[0], d[1], 5.1, 3.6, hDeg, Ramp.steel, G.head));
        const b0 = R(-5.1, -0.7), b1 = R(4.4, -1.4); P.push(cap(b0[0], b0[1], b1[0], b1[1], 1.1, 1.1, Ramp.steel, G.head));
        const horn = (a, bq, c) => { const p0 = R(...a), p1 = R(...bq), p2 = R(...c); P.push(cap(p0[0], p0[1], p1[0], p1[1], 1.8, 1.2, Ramp.bone, G.head)); P.push(cap(p1[0], p1[1], p2[0], p2[1], 1.2, 0.5, Ramp.bone, G.head)); };
        horn([-3, -4.6], [-7, -8], [-6, -12.5]);
        horn([2.2, -5], [5.8, -8.6], [4.6, -12.6]);
        const rv = R(-0.5, -3.5); M.push([rv[0], rv[1], C.steelHi]);
    } else if (cz.helm === 'soldier') {
        const d = R(-0.3, -2.2); P.push(ell(d[0], d[1], 5.2, 4.2, hDeg, Ramp.steel, G.head));
        const g0 = R(-2.8, -0.5), g1 = R(-1.6, 3.4); P.push(cap(g0[0], g0[1], g1[0], g1[1], 1.8, 1.4, Ramp.steel, G.head));
        const n0 = R(4.0, -2.5), n1 = R(4.4, 1.2); P.push(cap(n0[0], n0[1], n1[0], n1[1], 0.9, 0.8, Ramp.steel, G.head));
        const p0 = R(-0.5, -6), p1 = R(-6.5, -5), p2 = R(-9, -1.5);
        P.push(cap(p0[0], p0[1], p1[0], p1[1], 2.3, 1.6, cz.plume || Ramp.red, G.head));
        P.push(cap(p1[0], p1[1], p2[0], p2[1], 1.6, 1.0, cz.plume || Ramp.red, G.head));
    } else if (cz.helm === 'hood') {
        P.push(ell(hc[0], hc[1], 5.3, 5.9, hDeg, Ramp.black, G.head));
        const t0 = R(-2, -4.2), t1 = R(-7, -7.5); P.push(cap(t0[0], t0[1], t1[0], t1[1], 2.6, 1.0, Ramp.black, G.head));
        const e1 = R(2.4, -1), e2 = R(3.6, -1); M.push([e1[0], e1[1], C.red]); M.push([e2[0], e2[1], C.redHi]);
        const m0 = R(1.5, 1.8), m1 = R(4.4, 1.6); M.push([m0[0], m0[1], C.ink, m1[0], m1[1]]);
    } else if (cz.helm === 'warlord') {
        const d = R(-0.2, -1.4); P.push(ell(d[0], d[1], 5.5, 5.8, hDeg, Ramp.dark, G.head));
        const sl0 = R(1.2, -0.9), sl1 = R(5, -0.7); M.push([sl0[0], sl0[1], C.ink, sl1[0], sl1[1]]);
        const ey = R(3.4, -0.8); M.push([ey[0], ey[1], C.redHi]); const ey2 = R(2.5, -0.8); M.push([ey2[0], ey2[1], C.red]);
        const tr0 = R(-4.8, 1.8), tr1 = R(4.8, 1.8); M.push([tr0[0], tr0[1], C.gold, tr1[0], tr1[1]]);
        const horn = (a, bq, c) => { const p0 = R(...a), p1 = R(...bq), p2 = R(...c); P.push(cap(p0[0], p0[1], p1[0], p1[1], 2.4, 1.7, Ramp.bone, G.head)); P.push(cap(p1[0], p1[1], p2[0], p2[1], 1.7, 0.6, Ramp.bone, G.head)); };
        horn([-2.4, -4.6], [-8.4, -6.4], [-10.6, -12]);
        horn([2.2, -5], [7.2, -7.6], [8.6, -13]);
        const cr0 = R(-0.4, -5.8), cr1 = R(-1.2, -10); P.push(cap(cr0[0], cr0[1], cr1[0], cr1[1], 1.5, 0.5, Ramp.dark, G.head));
    } else if (cz.helm === 'thief') {
        const d = R(-0.6, -0.4); P.push(ell(d[0], d[1], 5.6, 6.0, hDeg, cz.hood, G.head));
        const t0 = R(-3.5, -3.5), t1 = R(-9, -1.5); P.push(cap(t0[0], t0[1], t1[0], t1[1], 2.6, 1.0, cz.hood, G.head));
        const f = R(2.4, 1.0); P.push(ell(f[0], f[1], 2.9, 3.2, hDeg, Ramp.black, G.head));
        const e = R(3.4, 0.2); M.push([e[0], e[1], C.hud]); const e2 = R(1.9, 0.2); M.push([e2[0], e2[1], C.fire]);
        const n = R(4.6, 1.6); P.push(ell(n[0], n[1], 1.5, 1.3, hDeg, cz.skin, G.head));
    }
    // ---- shield, front weapon, front arm, pauldron
    if (cz.shield) {
        const sc = [wriB[0] + 2, wriB[1] - 1];
        P.push(ell(sc[0], sc[1], 6.2, 8.4, pose.lean || 0, Ramp.steel, G.shield));
        P.push(ell(sc[0] + 0.3, sc[1], 4.9, 7.0, pose.lean || 0, cz.shield, G.shield));
        P.push(ell(sc[0] + 0.6, sc[1] - 0.3, 1.8, 1.9, 0, Ramp.gold, G.shield));
    }
    if (cz.weapon && pose.wl !== 'back' && !pose.noWeapon) weapon(P, M, cz.weapon, wriF, pose.w, G.weapon);
    arm(shF, elbF, wriF, G.frontArm, 0, false);
    if (cz.pauldron) {
        const pc = [shF[0] + ux * 0.8 - px * 1.2, shF[1] + uy * 0.8 - py * 1.2];
        P.push(ell(pc[0], pc[1], 4.2 * girth, 3.3, (pose.lean || 0) - 12, cz.pauldron, G.pauldron));
        if (cz.spikes) { const s0 = [pc[0] - 1, pc[1] - 3], s1 = [pc[0] - 3, pc[1] - 8]; P.push(cap(s0[0], s0[1], s1[0], s1[1], 1.5, 0.4, Ramp.bone, G.pauldron)); }
        M.push([pc[0] - 2, pc[1] + 1.8, cz.trim || C.steelLo, pc[0] + 3, pc[1] + 1.5]);
    }
    return { P, M };
}

// ------------------------------------------------------------------ the lizard mount
function lizard(p, cz) {
    const P = [], M = [];
    const g = { tail: 1, legB: 2, body: 3, legF: 4, neck: 5, head: 6, saddle: 7 };
    const by = -27 + (p.bob || 0), rot = p.rot === undefined ? -12 : p.rot;
    const skin = cz.skin || Ramp.green;
    // tail
    let tp = [-14, by + 1];
    const lens = [11, 10, 9, 9], rads = [6, 4.7, 3.5, 2.5, 1.7];
    const tail = p.tail || [165, 175, 190, 205];
    for (let i = 0; i < 4; i++) {
        const a = tail[i] * D2R, q = [tp[0] + Math.cos(a) * lens[i], tp[1] + Math.sin(a) * lens[i]];
        P.push(cap(tp[0], tp[1], q[0], q[1], rads[i], rads[i + 1], skin, g.tail));
        if (i < 3) { const m = lerp2(tp, q, 0.5); M.push([m[0] + Math.sin(a) * rads[i] * 0.8, m[1] - Math.cos(a) * rads[i] * 0.8, skin[3]]); }
        tp = q;
    }
    P.push(ell(tp[0], tp[1], 3.6, 3.6, 0, Ramp.bone, g.tail));
    for (const [dx, dy] of [[0, -4.8], [3.8, -2.4], [3.8, 2.6], [-3.6, -2.6], [0, 4.6]]) M.push([tp[0] + dx * 0.7, tp[1] + dy * 0.7, C.boneHi, tp[0] + dx, tp[1] + dy]);
    // legs
    const leg = (hx, foot, gg, sh) => {
        const hp = [hx, by + 6];
        P.push(ell(hp[0], hp[1], 6.6, 5.4, -20, skin, gg, sh));
        const [kn, an] = ik([hp[0], hp[1] + 2], foot, 9.5, 11, 1);
        P.push(cap(hp[0], hp[1] + 1, kn[0], kn[1], 4.4, 3, skin, gg, sh));
        P.push(cap(kn[0], kn[1], an[0], an[1], 2.7, 2.1, skin, gg, sh));
        P.push(cap(an[0], an[1], an[0] + 6.8, an[1] + 0.6, 1.9, 1.3, Ramp.bone, gg, sh));
        P.push(cap(an[0], an[1], an[0] - 3.2, an[1] + 0.7, 1.4, 0.9, Ramp.bone, gg, sh));
    };
    leg(-4, p.bf || [-4, 0], g.legB, 1);
    // body
    P.push(ell(-2, by, 15.5, 9.6, rot, skin, g.body));
    P.push(ell(2, by + 5, 10.5, 4.6, rot, cz.belly || Ramp.cream, g.body));
    for (let i = 0; i < 6; i++) {           // back ridge
        const x = -12 + i * 4.2, y = by - 9 + Math.abs(i - 2.5) * 0.7 + (i * 4.2 - 12) * Math.sin(rot * D2R) * 0.2;
        M.push([x, y, skin[3]]);
    }
    for (const [x, y] of [[-8, by - 2], [-3, by - 4], [2, by - 2], [-6, by + 3], [6, by - 5]]) M.push([x, y, skin[1]]);
    // arms
    P.push(cap(10, by - 1, 14, by + 4.5, 1.8, 1.3, skin, g.body));
    M.push([14.5, by + 5.4, C.boneHi]);
    leg(1, p.ff || [4, 0], g.legF, 0);
    // neck + head
    const hx = p.hx === undefined ? 19 : p.hx, hy = p.hy === undefined ? -46 : p.hy, open = p.open || 0;
    P.push(cap(9, by - 3, hx - 3, hy + 2, 5.8, 4.4, skin, g.neck));
    M.push([10, by - 2, cz.belly ? cz.belly[2] : C.furHi, hx - 1, hy + 4]);
    P.push(ell(hx, hy, 6.4, 4.9, 0, skin, g.head));
    P.push(poly([[hx + 3, hy - 2.8], [hx + 10.5, hy - 2.2], [hx + 13.5, hy + 0.6], [hx + 12, hy + 2.8], [hx + 10.6, hy + 0.9], [hx + 3, hy + 1]], Ramp.gold, g.head, 2));
    P.push(poly([[hx + 3, hy + 1.8], [hx + 10, hy + 1.6 + open], [hx + 9, hy + 3.4 + open], [hx + 3, hy + 3.8]], Ramp.gold, g.head, 1));
    M.push([hx + 1.4, hy - 1.4, C.ink]); M.push([hx + 2.3, hy - 1.9, C.redHi]);
    const cr = cz.crest || Ramp.red;
    for (const [a, bq, rr] of [[[hx - 3, hy - 3.6], [hx - 10, hy - 8], 1.8], [[hx - 1, hy - 4.4], [hx - 5, hy - 11], 1.7], [[hx - 4, hy - 1.8], [hx - 11, hy - 2.6], 1.6]])
        P.push(cap(a[0], a[1], bq[0], bq[1], rr, 0.6, cr, g.head));
    // saddle
    if (p.saddle !== false && cz.saddle !== false) {
        P.push(poly([[-13, by - 8.5], [3, by - 9.8], [4.2, by - 2.5], [-13.5, by - 1.5]], Ramp.red, g.saddle, 2));
        for (let x = -12; x <= 3; x += 3) M.push([x, by - 2.2, C.fur]);
        P.push(ell(-4, by - 10.5, 7.2, 2.7, rot * 0.5, Ramp.leather, g.saddle));
        M.push([-4, by - 8, C.gold]);
    }
    return { P, M };
}

// ------------------------------------------------------------------ costumes
const HERO = {
    scale: 1, skin: Ramp.skin, torsoStyle: 'bare', trunks: Ramp.blue, pelvis: Ramp.blue, boot: Ramp.leather, cuff: Ramp.fur,
    bracer: Ramp.leather, bracerB: Ramp.leather, pauldron: Ramp.steel, hair: 'mane', face: 'hero', weapon: 'sword', belt: Ramp.leather,
};
export const Costumes = {
    hero: HERO,
    raider: {
        scale: 1.03, skin: Ramp.skin, torsoStyle: 'vest', chest: Ramp.leather, belly: Ramp.leather, pelvis: Ramp.red, thigh: Ramp.red, shin: Ramp.red,
        boot: Ramp.fur, bracer: Ramp.fur, helm: 'horned', face: 'brute', weapon: 'club', build: { girth: 1.12 }, loin: Ramp.fur,
    },
    raider2: {
        scale: 1.03, skin: Ramp.skin, torsoStyle: 'vest', chest: Ramp.leather, belly: Ramp.leather, pelvis: Ramp.purple, thigh: Ramp.purple, shin: Ramp.purple,
        boot: Ramp.fur, bracer: Ramp.fur, helm: 'horned', face: 'brute', weapon: 'club', build: { girth: 1.12 }, loin: Ramp.fur,
    },
    axeman: {
        scale: 1.06, skin: Ramp.skin, torsoStyle: 'bare', pelvis: Ramp.green, thigh: Ramp.green, shin: Ramp.green, boot: Ramp.leather,
        bracer: Ramp.steel, helm: 'horned', face: 'brute', weapon: 'axe', build: { girth: 1.15, limb: 1.08 }, loin: Ramp.fur, beard: Ramp.dirt,
    },
    soldier: {
        scale: 1.02, skin: Ramp.skin, torsoStyle: 'plate', chest: Ramp.steel, belly: Ramp.steel, pelvis: Ramp.red, thigh: Ramp.red, shin: Ramp.steel,
        boot: Ramp.leather, upper: Ramp.red, fore: Ramp.steel, fist: Ramp.leather, helm: 'soldier', weapon: 'sword', shield: Ramp.red, tabard: Ramp.red,
        pauldron: Ramp.steel, greaves: Ramp.steel,
    },
    soldier2: {
        scale: 1.02, skin: Ramp.skin, torsoStyle: 'plate', chest: Ramp.steel, belly: Ramp.steel, pelvis: Ramp.blue, thigh: Ramp.blue, shin: Ramp.steel,
        boot: Ramp.leather, upper: Ramp.blue, fore: Ramp.steel, fist: Ramp.leather, helm: 'soldier', plume: Ramp.gold, weapon: 'sword', shield: Ramp.blue, tabard: Ramp.blue,
        pauldron: Ramp.steel, greaves: Ramp.steel,
    },
    skeleton: { scale: 1, skeleton: true, weapon: 'rustsword', shield: Ramp.rust, skin: Ramp.bone },
    thiefBlue: { scale: 0.64, skin: Ramp.skin, torsoStyle: 'tunic', chest: Ramp.blue, belly: Ramp.blue, pelvis: Ramp.blue, thigh: Ramp.blue, shin: Ramp.blue, boot: Ramp.leather, helm: 'thief', hood: Ramp.blue, sack: true, build: { girth: 1.1 } },
    thiefGreen: { scale: 0.64, skin: Ramp.skin, torsoStyle: 'tunic', chest: Ramp.green, belly: Ramp.green, pelvis: Ramp.green, thigh: Ramp.green, shin: Ramp.green, boot: Ramp.leather, helm: 'thief', hood: Ramp.green, sack: true, build: { girth: 1.1 } },
    headsman: {
        scale: 1.3, skin: Ramp.skin, torsoStyle: 'bare', pelvis: Ramp.black, thigh: Ramp.black, shin: Ramp.black, boot: Ramp.leather, bracer: Ramp.black,
        helm: 'hood', face: 'hood', weapon: 'greataxe', build: { girth: 1.2, limb: 1.1 }, belt: Ramp.leather,
    },
    giant: {
        scale: 1.48, skin: Ramp.skin, torsoStyle: 'bare', pelvis: Ramp.fur, thigh: Ramp.skin, shin: Ramp.skin, boot: Ramp.fur, bracer: Ramp.steel,
        face: 'brute', beard: Ramp.hair, weapon: 'hammer', build: { girth: 1.25, limb: 1.2 }, loin: Ramp.fur, trunks: Ramp.fur, pauldron: Ramp.fur,
    },
    giantB: {
        scale: 1.48, skin: Ramp.ogre, torsoStyle: 'bare', pelvis: Ramp.fur, thigh: Ramp.ogre, shin: Ramp.ogre, boot: Ramp.fur, bracer: Ramp.steel,
        face: 'brute', beard: Ramp.dirt, weapon: 'hammer', build: { girth: 1.25, limb: 1.2 }, loin: Ramp.fur, trunks: Ramp.fur, pauldron: Ramp.fur,
    },
    warlord: {
        scale: 1.36, skin: Ramp.skin, torsoStyle: 'plate', chest: Ramp.dark, belly: Ramp.dark, pelvis: Ramp.dark, thigh: Ramp.dark, shin: Ramp.dark, boot: Ramp.dark,
        upper: Ramp.dark, fore: Ramp.dark, fist: Ramp.dark, helm: 'warlord', weapon: 'greatsword', cape: Ramp.purple, pauldron: Ramp.dark, spikes: true,
        trim: C.gold, tabard: Ramp.purple, tabardEdge: C.gold, build: { girth: 1.18, limb: 1.12 }, greaves: Ramp.dark,
    },
    lizard: { scale: 1, lizard: true },
    heroTitle: Object.assign({}, HERO, { scale: 0.7 }),
    lizardTitle: { scale: 0.66, lizard: true, saddle: false },
    lizardBare: { scale: 1, lizard: true, saddle: false },
    warlordTitle: null,
};

Costumes.warlordTitle = Object.assign({}, Costumes.warlord, { scale: 0.42, cape: null });

// ------------------------------------------------------------------ poses (hero units)
// hip, lean (deg, + = forward), head (deg), ff/bf = front/back foot, fh/bh = front/back hand, w = weapon
// angle (deg, 0 = forward, -90 = up), wl 'back' = the weapon passes behind the body
const ONE = {
    idle0: { hip: [0, -26], lean: 6, ff: [7, 0], bf: [-6, 0], fh: [12, -27], bh: [-7, -25], w: -58 },
    idle1: { hip: [0, -25.3], lean: 7, ff: [7, 0], bf: [-6, 0], fh: [12, -26.2], bh: [-7, -24.4], w: -55 },
    walk0: { hip: [0, -25.4], lean: 8, ff: [10, 0], bf: [-8, 0], fh: [11, -27], bh: [-4, -26], w: -50 },
    walk1: { hip: [0, -26.6], lean: 8, ff: [3, -4.5], bf: [-1, 0], fh: [12, -28], bh: [-7, -26], w: -54 },
    walk2: { hip: [0, -25.4], lean: 8, ff: [-8, 0], bf: [10, 0], fh: [13, -28], bh: [-9, -25], w: -58 },
    walk3: { hip: [0, -26.6], lean: 8, ff: [-1, 0], bf: [3, -4.5], fh: [12, -28], bh: [-7, -26], w: -54 },
    a1w: { hip: [-1, -26], lean: -3, ff: [8, 0], bf: [-7, 0], fh: [-1, -41], bh: [-9, -28], w: -150, wl: 'back' },
    a1s: { hip: [3, -24], lean: 14, ff: [13, 0], bf: [-8, 0], fh: [19, -31], bh: [-6, -30], w: 3 },
    a2w: { hip: [1, -25], lean: 10, ff: [12, 0], bf: [-8, 0], fh: [4, -21], bh: [-4, -29], w: 160, wl: 'back' },
    a2s: { hip: [2, -25], lean: 5, ff: [12, 0], bf: [-8, 0], fh: [15, -41], bh: [-7, -28], w: -45 },
    a3w: { hip: [-1, -27], lean: -8, ff: [8, 0], bf: [-8, 0], fh: [1, -51], bh: [-2, -50], w: -112, wl: 'back' },
    a3s: { hip: [4, -21], lean: 22, ff: [15, 0], bf: [-10, 0], fh: [18, -25], bh: [15, -26], w: 38 },
    jump: { hip: [0, -30], lean: 4, ff: [7, -11], bf: [-6, -7], fh: [11, -36], bh: [-7, -33], w: -72 },
    jatk: { hip: [0, -30], lean: 18, ff: [8, -10], bf: [-7, -14], fh: [16, -25], bh: [11, -26], w: 64 },
    run0: { hip: [0, -24], lean: 20, ff: [13, -1], bf: [-12, -5], fh: [-5, -25], bh: [9, -33], w: 172, wl: 'back' },
    run1: { hip: [0, -25.5], lean: 20, ff: [-8, -6], bf: [10, 0], fh: [-2, -27], bh: [4, -31], w: 168, wl: 'back' },
    dash: { hip: [3, -22], lean: 28, ff: [15, 0], bf: [-13, 0], fh: [23, -28], bh: [8, -32], w: -3 },
    grab: { hip: [0, -26], lean: 10, ff: [9, 0], bf: [-6, 0], fh: [15, -36], bh: [11, -35], w: -84 },
    throw0: { hip: [0, -27], lean: -6, ff: [7, 0], bf: [-7, 0], fh: [4, -55], bh: [0, -53], w: -96 },
    throw1: { hip: [-2, -25], lean: -20, ff: [9, 0], bf: [-8, 0], fh: [-12, -47], bh: [-14, -45], w: -150, wl: 'back' },
    hurt: { hip: [-2, -25], lean: -16, head: -15, ff: [7, 0], bf: [-8, 0], fh: [6, -24], bh: [-12, -31], w: 40 },
    fly: { hip: [0, -16], lean: -62, head: -20, ff: [13, -22], bf: [9, -13], fh: [-8, -34], bh: [-12, -28], w: -160, cape: 1 },
    down: { hip: [5, -5], lean: -88, head: -8, ff: [21, -2.6], bf: [18, -2], fh: [-8, -3], bh: [-3, -2], w: 176 },
    getup: { hip: [0, -14], lean: 22, ff: [10, 0], bf: [-8, 0], fh: [10, -15], bh: [-4, -12], w: -30 },
    magic: { hip: [0, -27], lean: -6, head: -22, ff: [7, 0], bf: [-7, 0], fh: [4, -58], bh: [-3, -51], w: -92 },
    ride: { hip: [0, -9], lean: 4, ff: [8, 6], bf: [5, 7], fh: [13, -18], bh: [-1, -16], w: -46 },
    rideA: { hip: [0, -9], lean: 14, ff: [8, 6], bf: [5, 7], fh: [18, -15], bh: [-1, -16], w: -4 },
    sit: { hip: [0, -7], lean: 14, head: 10, ff: [13, 0], bf: [9, -1], fh: [14, -12], bh: [10, -11], w: -80 },
    kick: { hip: [-2, -27], lean: -14, ff: [17, -16], bf: [-4, 0], fh: [4, -30], bh: [-12, -30], w: -120, wl: 'back' },
    win: { hip: [0, -27], lean: -4, head: -10, ff: [8, 0], bf: [-7, 0], fh: [8, -56], bh: [-9, -30], w: -80 },
    // enemy aliases: windup / strike
    w: { hip: [-1, -26], lean: -3, ff: [8, 0], bf: [-7, 0], fh: [-1, -41], bh: [-9, -28], w: -150, wl: 'back' },
    s: { hip: [3, -24], lean: 14, ff: [13, 0], bf: [-8, 0], fh: [19, -31], bh: [-6, -30], w: 3 },
};
const CLUB = Object.assign({}, ONE, {
    idle0: { hip: [0, -25.5], lean: 12, ff: [8, 0], bf: [-6, 0], fh: [11, -27], bh: [-6, -25], w: -70 },
    idle1: { hip: [0, -24.8], lean: 13, ff: [8, 0], bf: [-6, 0], fh: [11, -26.3], bh: [-6, -24.4], w: -66 },
    w: { hip: [-1, -26], lean: -4, ff: [8, 0], bf: [-8, 0], fh: [1, -47], bh: [-8, -30], w: -118, wl: 'back' },
    s: { hip: [4, -22], lean: 20, ff: [14, 0], bf: [-9, 0], fh: [18, -27], bh: [-5, -30], w: 42 },
});
const SHIELD = Object.assign({}, ONE, {
    idle0: { hip: [0, -26], lean: 5, ff: [7, 0], bf: [-6, 0], fh: [6, -26], bh: [9, -31], w: -60 },
    idle1: { hip: [0, -25.4], lean: 6, ff: [7, 0], bf: [-6, 0], fh: [6, -25.4], bh: [9, -30.4], w: -58 },
    walk0: { hip: [0, -25.4], lean: 7, ff: [10, 0], bf: [-8, 0], fh: [5, -26], bh: [9, -31], w: -55 },
    walk1: { hip: [0, -26.6], lean: 7, ff: [3, -4.5], bf: [-1, 0], fh: [6, -27], bh: [9, -32], w: -58 },
    walk2: { hip: [0, -25.4], lean: 7, ff: [-8, 0], bf: [10, 0], fh: [6, -27], bh: [9, -31], w: -60 },
    walk3: { hip: [0, -26.6], lean: 7, ff: [-1, 0], bf: [3, -4.5], fh: [6, -27], bh: [9, -32], w: -58 },
    w: { hip: [-2, -26], lean: -4, ff: [8, 0], bf: [-8, 0], fh: [-6, -31], bh: [8, -32], w: 180, wl: 'back' },
    s: { hip: [4, -24], lean: 16, ff: [14, 0], bf: [-9, 0], fh: [21, -30], bh: [4, -31], w: 0 },
});
const HEAVY = Object.assign({}, ONE, {
    idle0: { hip: [0, -26], lean: 9, ff: [8, 0], bf: [-7, 0], fh: [9, -25], bh: [2, -30], w: -64 },
    idle1: { hip: [0, -25.3], lean: 10, ff: [8, 0], bf: [-7, 0], fh: [9, -24.4], bh: [2, -29.4], w: -62 },
    walk0: { hip: [0, -25.4], lean: 10, ff: [10, 0], bf: [-8, 0], fh: [9, -25], bh: [2, -30], w: -60 },
    walk1: { hip: [0, -26.6], lean: 10, ff: [3, -4.5], bf: [-1, 0], fh: [9, -26], bh: [2, -31], w: -62 },
    walk2: { hip: [0, -25.4], lean: 10, ff: [-8, 0], bf: [10, 0], fh: [9, -25], bh: [2, -30], w: -64 },
    walk3: { hip: [0, -26.6], lean: 10, ff: [-1, 0], bf: [3, -4.5], fh: [9, -26], bh: [2, -31], w: -62 },
    w: { hip: [-1, -26], lean: -10, ff: [8, 0], bf: [-8, 0], fh: [-3, -48], bh: [-6, -46], w: -128, wl: 'back' },
    s: { hip: [4, -21], lean: 24, ff: [15, 0], bf: [-10, 0], fh: [18, -24], bh: [14, -25], w: 42 },
    s2: { hip: [3, -24], lean: 12, ff: [14, 0], bf: [-9, 0], fh: [20, -30], bh: [16, -31], w: 2 },
    w2: { hip: [-2, -26], lean: -2, ff: [8, 0], bf: [-8, 0], fh: [-7, -30], bh: [-9, -32], w: 178, wl: 'back' },
    pound: { hip: [2, -18], lean: 30, ff: [14, 0], bf: [-10, 0], fh: [14, -12], bh: [11, -13], w: 88 },
});
const THIEF = Object.assign({}, ONE, {
    idle0: { hip: [0, -24], lean: 18, ff: [8, 0], bf: [-6, 0], fh: [9, -26], bh: [-3, -37], w: 0, noWeapon: true },
    idle1: { hip: [0, -23.4], lean: 19, ff: [8, 0], bf: [-6, 0], fh: [9, -25.4], bh: [-3, -36.4], w: 0, noWeapon: true },
    walk0: { hip: [0, -23], lean: 24, ff: [13, -1], bf: [-11, -4], fh: [9, -29], bh: [-3, -36], w: 0 },
    walk1: { hip: [0, -24.6], lean: 24, ff: [4, -6], bf: [-2, 0], fh: [6, -27], bh: [-3, -37], w: 0 },
    walk2: { hip: [0, -23], lean: 24, ff: [-9, -3], bf: [12, 0], fh: [3, -26], bh: [-3, -36], w: 0 },
    walk3: { hip: [0, -24.6], lean: 24, ff: [-1, 0], bf: [4, -6], fh: [6, -27], bh: [-3, -37], w: 0 },
    hurt: { hip: [-2, -24], lean: -20, head: -20, ff: [7, 0], bf: [-8, 0], fh: [8, -34], bh: [-10, -34], w: 0 },
});

const POSESETS = { one: ONE, club: CLUB, shield: SHIELD, heavy: HEAVY, thief: THIEF };
const COSTUME_POSESET = {
    heroTitle: 'one', warlordTitle: 'heavy',
    hero: 'one', raider: 'club', raider2: 'club', axeman: 'heavy', soldier: 'shield', soldier2: 'shield', skeleton: 'shield',
    thiefBlue: 'thief', thiefGreen: 'thief', headsman: 'heavy', giant: 'heavy', giantB: 'heavy', warlord: 'heavy',
};

// the lizard's poses
const LIZ = {
    idle0: { ff: [5, 0], bf: [-4, 0], tail: [165, 176, 192, 208] },
    idle1: { ff: [5, 0], bf: [-4, 0], tail: [167, 180, 198, 214], bob: 0.6, hy: -45.4 },
    walk0: { ff: [11, 0], bf: [-8, 0], tail: [162, 172, 188, 204], bob: 0.5 },
    walk1: { ff: [3, -5], bf: [-2, 0], tail: [166, 178, 194, 210], bob: -0.8, hy: -46.8 },
    walk2: { ff: [-7, 0], bf: [10, 0], tail: [170, 182, 198, 214], bob: 0.5 },
    walk3: { ff: [0, 0], bf: [4, -5], tail: [166, 178, 194, 210], bob: -0.8, hy: -46.8 },
    whipW: { ff: [9, 0], bf: [-8, 0], tail: [205, 235, 265, 295], rot: -4, bob: 2, hx: 22, hy: -40, open: 2 },
    whipS: { ff: [10, 0], bf: [-9, 0], tail: [178, 180, 180, 178], rot: -16, bob: 0.5, hx: 17, hy: -47, open: 3 },
    run0: { ff: [14, -2], bf: [-12, -1], tail: [172, 178, 184, 190], rot: -6, bob: -1, hx: 22, hy: -43, open: 2 },
    run1: { ff: [-9, -5], bf: [12, 0], tail: [176, 182, 188, 194], rot: -8, bob: 0.5, hx: 22, hy: -42, open: 2 },
    jump: { ff: [9, -8], bf: [-6, -5], tail: [160, 170, 185, 200], rot: -18, hx: 20, hy: -48 },
};

const cache = new Map();

// the sprite for a costume in a pose (built once)
export function sprite(costumeId, poseName) {
    const key = costumeId + ':' + poseName;
    let s = cache.get(key);
    if (s) return s;
    const cz = Costumes[costumeId];
    let built;
    if (cz.lizard) built = lizard(LIZ[poseName] || LIZ.idle0, cz);
    else {
        const set = POSESETS[COSTUME_POSESET[costumeId] || 'one'];
        built = humanoid(set[poseName] || ONE[poseName] || ONE.idle0, cz);
    }
    scalePrims(built.P, built.M, (cz.scale || 1) * SCALE);
    s = raster(built.P, built.M);
    cache.set(key, s);
    return s;
}

// where a rider's origin sits on a lizard (lizard facing right, relative to the lizard's ground point)
export function saddleOffset(poseName) {
    const p = LIZ[poseName] || LIZ.idle0;
    const by = -27 + (p.bob || 0);
    return [Math.round(-4 * SCALE), Math.round((by - 3) * SCALE)];
}

export const PoseNames = { one: Object.keys(ONE), heavy: Object.keys(HEAVY), thief: Object.keys(THIEF), lizard: Object.keys(LIZ) };
