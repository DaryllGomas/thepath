// THE NODE · world 1 · AFTERGLOW · THE MODELS: the references the sprite workshop bakes (raster.js).
// Units are metres; x right, y up, z forward (the nose points +z). All designs are original.
//
//   HERO      the player's jet: twin-engine, twin canted tails, swept wings, white-grey with red tips,
//             cyan canopy, two glowing nozzles (the afterburner is drawn over them, animated)
//   FOE       the enemy fighter: delta wing with canards and one tall fin, gunmetal; the ACE variant has a
//             red nose, red fin cap and a gold canopy (aces fire missiles: you learn to read the red)
//   BOMBER    mid-stage heavy: 92 m straight-swept wing, four engine nacelles (the four lock points)
//   FORTRESS  end-stage flying battleship: a 136 m hexagonal hull, sponson wings, a bridge tower, four
//             turrets and two engine pods (the six lock points), three main thrusters burning
//   SHIP, SPIRE   scenery at sea and in the desert
import { Mesh, loft, slab, fin, box, tube } from './raster.js';
import { ramp, ix } from './palette.js';

const UP = [0, 1, 0];

// ------------------------------------------------------------------ materials (4-step ramps, bright > dark)
const GLOW = c => [ix(c), ix(c), ix(c), ix(c)];
export const HERO_MATS = {
    body: ramp('jet0', 'jet1', 'jet2', 'jet3'),
    trim: ramp('trim0', 'red', 'darkRed', 'darkRed'),
    glass: ramp('glass0', 'glass1', 'glass2', 'glass2'),
    metal: ramp('jet3', 'metal', 'metal', 'ink'),
    glow: GLOW('yellow'),
};
export const FOE_MATS = {
    body: ramp('foe0', 'foe1', 'foe2', 'foe3'),
    accent: ramp('foe0', 'foe1', 'foe2', 'foe3'),
    glass: ramp('yellow', 'orange', 'darkRed', 'darkRed'),
    metal: ramp('foe2', 'metal', 'metal', 'ink'),
    glow: GLOW('orange'),
};
export const ACE_MATS = { ...FOE_MATS, accent: ramp('trim0', 'red', 'darkRed', 'darkRed') };
export const BOMBER_MATS = {
    body: ramp('olive0', 'olive1', 'olive2', 'olive3'),
    glass: ramp('glass0', 'glass1', 'glass2', 'glass2'),
    metal: ramp('olive2', 'metal', 'metal', 'ink'),
    stripe: ramp('trim0', 'red', 'darkRed', 'darkRed'),
    glow: GLOW('orange'),
};
export const FORT_MATS = {
    body: ramp('fort0', 'fort1', 'fort2', 'fort3'),
    deck: ramp('fort1', 'fort2', 'fort3', 'ink'),
    metal: ramp('fort2', 'fort3', 'metal', 'ink'),
    turret: ramp('foe0', 'foe1', 'foe2', 'foe3'),
    lights: GLOW('yellow'),
    stripe: ramp('trim0', 'red', 'darkRed', 'darkRed'),
    glow: GLOW('orange'),
    core: GLOW('fire0'),
};
export const SHIP_MATS = {
    hull: ramp('hull0', 'hull1', 'hull2', 'ink'),
    deck: ramp('hull1', 'hull2', 'hull2', 'ink'),
    tower: ramp('jet1', 'jet2', 'jet3', 'ink'),
};
export const SPIRE_MATS = {
    rock: ramp('mesa0', 'mesa1', 'mesa2', 'rock4'),
    cap: ramp('sand3', 'sand2', 'sand1', 'sand0'),
};

// ------------------------------------------------------------------ the hero jet (span 13 m, length 18.6 m)
export const HERO_NOZZLES = [[-0.72, 0.0, -9.45], [0.72, 0.0, -9.45]];
export function heroMesh() {
    const m = new Mesh();
    loft(m, 'body', [
        { z: 9.3, w: 0.04, h: 0.04, y: 0.05 },
        { z: 7.7, w: 0.42, h: 0.40, y: 0.08, mat: 'body' },
        { z: 5.3, w: 0.78, h: 0.66, y: 0.12 },
        { z: 2.4, w: 1.02, h: 0.78, y: 0.12 },
        { z: 0.0, w: 1.30, h: 0.74, y: 0.06 },
        { z: -3.2, w: 1.40, h: 0.70, y: 0.0 },
        { z: -6.4, w: 1.36, h: 0.64, y: 0.0 },
        { z: -8.4, w: 1.22, h: 0.58, y: 0.0 },
    ], 8, { capBack: 'metal' });
    // canopy
    loft(m, 'glass', [
        { z: 6.2, w: 0.05, h: 0.05, y: 0.62 },
        { z: 4.9, w: 0.42, h: 0.48, y: 0.66 },
        { z: 3.0, w: 0.50, h: 0.54, y: 0.70 },
        { z: 1.1, w: 0.32, h: 0.30, y: 0.66 },
    ], 6, { half: true, capBack: 'body', bias: -0.01 });
    // intakes
    box(m, 'body', 1.0, 1.9, -0.62, 0.40, -3.2, 2.6, 'metal');
    box(m, 'body', -1.9, -1.0, -0.62, 0.40, -3.2, 2.6, 'metal');
    // wings, with red tips
    slab(m, 'body', [[1.1, 0, 2.0], [6.5, -0.12, -3.9], [6.5, -0.12, -5.3], [1.2, 0, -5.4]], UP, 0.16, true);
    slab(m, 'trim', [[5.3, -0.09, -2.65], [6.55, -0.12, -3.85], [6.55, -0.12, -5.35], [5.3, -0.09, -5.34]], UP, 0.2, true, -0.02);
    // stabilisers
    slab(m, 'body', [[1.2, 0, -6.2], [3.9, -0.05, -8.2], [3.9, -0.05, -9.2], [1.2, 0, -8.9]], UP, 0.12, true);
    // twin fins, canted out, red caps
    fin(m, 'body', [[-5.4, 0.55], [-8.0, 3.7], [-9.0, 3.7], [-8.9, 0.55]], 1.05, 0.24, 0.14, true);
    fin(m, 'trim', [[-7.55, 3.15], [-8.0, 3.74], [-9.02, 3.74], [-8.95, 3.15]], 1.05 + 2.6 * Math.tan(0.24), 0.24, 0.2, true, -0.02);
    // nozzles
    tube(m, 'metal', -0.72, 0.0, -8.2, -9.45, 0.66, 0.6, 8, 'glow');
    tube(m, 'metal', 0.72, 0.0, -8.2, -9.45, 0.66, 0.6, 8, 'glow');
    return m;
}

// ------------------------------------------------------------------ the foe (span 10.4 m, length 15 m)
export function foeMesh() {
    const m = new Mesh();
    loft(m, 'body', [
        { z: 7.7, w: 0.04, h: 0.04, y: 0.0, mat: 'accent' },
        { z: 6.0, w: 0.38, h: 0.36, y: 0.02 },
        { z: 3.5, w: 0.70, h: 0.62, y: 0.08 },
        { z: 0.5, w: 0.95, h: 0.70, y: 0.05 },
        { z: -3.5, w: 0.92, h: 0.66, y: 0.0 },
        { z: -6.8, w: 0.72, h: 0.56, y: 0.0 },
    ], 8, { capBack: 'metal' });
    loft(m, 'glass', [
        { z: 4.9, w: 0.05, h: 0.05, y: 0.5 },
        { z: 3.8, w: 0.36, h: 0.42, y: 0.55 },
        { z: 2.0, w: 0.40, h: 0.44, y: 0.58 },
        { z: 1.0, w: 0.28, h: 0.24, y: 0.55 },
    ], 6, { half: true, capBack: 'body', bias: -0.01 });
    slab(m, 'body', [[0.8, 0, 1.4], [5.2, -0.25, -4.4], [5.2, -0.25, -5.3], [0.8, 0, -5.6]], UP, 0.16, true);
    slab(m, 'body', [[0.7, 0.12, 4.4], [2.3, 0.12, 3.0], [2.3, 0.12, 2.5], [0.7, 0.12, 2.8]], UP, 0.1, true);
    fin(m, 'body', [[-2.6, 0.6], [-5.8, 3.9], [-6.9, 3.9], [-6.8, 0.6]], 0, 0, 0.18);
    fin(m, 'accent', [[-5.2, 3.2], [-5.82, 3.94], [-6.92, 3.94], [-6.86, 3.2]], 0, 0, 0.24, false, -0.02);
    tube(m, 'metal', 0, 0, -6.6, -7.5, 0.62, 0.56, 8, 'glow');
    return m;
}

// ------------------------------------------------------------------ the bomber (span 92 m, length 47 m)
export const BOMBER_POINTS = (() => {
    const pts = [];
    for (const x of [-29, -15, 15, 29]) pts.push([x, 0.5 + 2.0 * (Math.abs(x) - 3) / 43 - 2.4, -7.6]);
    return pts;
})();
export function bomberMesh() {
    const m = new Mesh();
    loft(m, 'body', [
        { z: 24, w: 0.3, h: 0.3, y: 0 },
        { z: 20, w: 2.4, h: 2.4, y: 0.3 },
        { z: 14, w: 3.4, h: 3.2, y: 0.4 },
        { z: -8, w: 3.4, h: 3.2, y: 0.4 },
        { z: -18, w: 2.2, h: 2.2, y: 1.0 },
        { z: -23, w: 0.8, h: 0.8, y: 1.6 },
    ], 8, { capBack: 'metal' });
    loft(m, 'glass', [
        { z: 21.5, w: 0.2, h: 0.2, y: 2.0 },
        { z: 19.5, w: 1.3, h: 1.1, y: 2.2 },
        { z: 16.5, w: 1.4, h: 1.0, y: 2.5 },
    ], 6, { half: true, capBack: 'body', bias: -0.02 });
    slab(m, 'body', [[3, 0.5, 7], [46, 2.5, -5], [46, 2.5, -12], [3, 0.5, -10]], UP, 1.2, true);
    slab(m, 'stripe', [[41, 2.28, -4.6], [46.1, 2.52, -6], [46.1, 2.52, -12.1], [41, 2.28, -11.4]], UP, 1.45, true, -0.05);
    for (const [x, y] of BOMBER_POINTS) {
        tube(m, 'body', x, y, 5.0, -2.5, 2.5, 2.5, 8, null);
        tube(m, 'metal', x, y, -2.5, -7.6, 2.5, 2.1, 8, 'glow');
    }
    slab(m, 'body', [[1.5, 1.2, -16], [13, 1.8, -21], [13, 1.8, -24], [1.5, 1.2, -23]], UP, 0.5, true);
    fin(m, 'body', [[-13, 2.5], [-20, 11], [-23.5, 11], [-23, 2.5]], 0, 0, 0.6);
    fin(m, 'stripe', [[-18.8, 9.4], [-20.05, 11.05], [-23.55, 11.05], [-23.4, 9.4]], 0, 0, 0.8, false, -0.05);
    return m;
}

// ------------------------------------------------------------------ the fortress (width 113 m, length 136 m)
// lock points: four turrets on the deck, two engine pods at the sponson tips
export const FORT_POINTS = [[-13, 13.6, 28], [13, 13.6, 28], [-13, 13.6, -24], [13, 13.6, -24], [-50, -2, -47], [50, -2, -47]];
export function fortMesh() {
    const m = new Mesh();
    loft(m, 'body', [
        { z: 68, w: 2, h: 2, y: 0 },
        { z: 52, w: 14, h: 8, y: 0 },
        { z: 20, w: 22, h: 11, y: 0 },
        { z: -40, w: 24, h: 12, y: 0 },
        { z: -62, w: 18, h: 9, y: 0 },
    ], 6, { capBack: 'metal' });
    // the deck stripe down the spine
    box(m, 'deck', -6, 6, 11.2, 12.2, -46, 44);
    // sponson wings with red leading stripes
    slab(m, 'body', [[20, -2, 24], [50, -2, -8], [50, -2, -44], [20, -2, -52]], UP, 4.5, true);
    slab(m, 'stripe', [[22, -2, 21], [50.2, -2, -8.5], [50.2, -2, -13], [22, -2, 16]], UP, 4.7, true, -0.2);
    // bridge tower
    box(m, 'body', -5, 5, 10, 25, -4, 16);
    box(m, 'deck', -7.5, 7.5, 25, 29, 2, 14, 'lights');
    box(m, 'lights', -6, 6, 26, 27.2, 1.5, 2.2, null, null, -0.1);
    // turrets (barrels point back at you)
    for (const [x, y, z] of FORT_POINTS.slice(0, 4)) {
        box(m, 'turret', x - 3, x + 3, y - 2.4, y + 1.2, z - 3, z + 3);
        box(m, 'metal', x - 1.9, x - 1.1, y - 0.6, y + 0.3, z - 11, z - 3);
        box(m, 'metal', x + 1.1, x + 1.9, y - 0.6, y + 0.3, z - 11, z - 3);
    }
    // engine pods at the sponson tips
    for (const sx of [-1, 1]) {
        tube(m, 'body', sx * 50, -2, -6, -40, 6.5, 6.5, 8, null);
        tube(m, 'metal', sx * 50, -2, -40, -47, 6.5, 5.2, 8, 'glow');
    }
    // three main thrusters
    for (const x of [-11, 0, 11]) tube(m, 'metal', x, 0, -58, -68, 5.2, 4.6, 8, 'core');
    return m;
}

// ------------------------------------------------------------------ scenery
export function shipMesh() {
    const m = new Mesh();
    loft(m, 'hull', [
        { z: 34, w: 0.4, h: 2.5, y: 2 },
        { z: 22, w: 5.5, h: 3.5, y: 2 },
        { z: -22, w: 6.0, h: 3.5, y: 2 },
        { z: -30, w: 4.5, h: 3.0, y: 2.5 },
    ], 6, { capBack: 'hull' });
    box(m, 'deck', -5, 5, 5.2, 5.8, -26, 22);
    box(m, 'tower', -2.2, 2.2, 5.8, 14, -6, 4);
    box(m, 'tower', -1.2, 1.2, 14, 20, -3, 1);
    box(m, 'deck', -2.6, 2.6, 5.8, 8.5, 10, 16);
    return m;
}

export function spireMesh(seed) {
    const m = new Mesh();
    const st = [];
    let r = 13 + (seed % 5);
    for (let k = 0; k <= 5; k++) {
        const y = k * 18;
        const wob = ((seed * (k + 3) * 7919) % 17) / 17;
        st.push({ z: y, w: r * (0.8 + 0.4 * wob), h: r * (0.75 + 0.35 * (1 - wob)), y: 0 });
        r *= 0.86;
    }
    // loft along z, then swap axes so it stands up (z -> y)
    loft(m, 'rock', st, 7, { capBack: 'cap' });
    for (let i = 0; i < m.v.length; i += 3) { const y = m.v[i + 1], z = m.v[i + 2]; m.v[i + 1] = z; m.v[i + 2] = -y; }
    return m;
}
