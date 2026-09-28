// THE NODE · world 1 · AFTERGLOW on the Cabinet Engine · THE PALETTE (data only, no imports but the SDK).
//
// A 1987 sit-down board had a big fixed palette; this one has 96 entries in named RAMPS. Everything the
// renderer, the sprite pre-renderer and the title art draw comes from here (CabinetChecks fails any
// off-palette pixel). Gradients are ordered-dithered between neighbouring ramp entries, never blended.
//
//   HUD      ink (outlines, shadows), white, yellow, orange, red, darkRed, green (reticle), cyan
//   JETS     the hero jet (white-grey ramp, red trim, cyan glass), the foe (gunmetal), the bomber (olive),
//            the fortress (plum steel), plus metal for nozzles
//   FIRE     fire0 > yellow > orange > red > darkRed > smoke
//   STAGE 1  OPEN SEA: a blue sky ramp over a blue sea ramp
//   STAGE 2  RED DESERT: a pale-hazed sky over a sand ramp, far mesas
//   STAGE 3  AFTERGLOW CANYON: the sunset (purple > magenta > orange > gold), the striped sun, rock walls,
//            a dark floor with a river that burns orange
import { Palette } from '../../sdk/index.js';

export const AfterglowPalette = new Palette(
    ['bg', 0x000000],          // the tube (and the 8 px margin)
    ['ink', 0x0C0A1C],         // sprite outlines, text shadows
    ['white', 0xFFFFFF],
    ['yellow', 0xFFE23C],
    ['orange', 0xFF8C1A],
    ['red', 0xEE2A1E],
    ['darkRed', 0x7C0E1A],
    ['green', 0x58FF6E],
    ['greenDim', 0x1E8C36],
    ['cyan', 0x6AE8FF],
    // the hero jet
    ['jet0', 0xF2F4F8], ['jet1', 0xBCC4D2], ['jet2', 0x7E889C], ['jet3', 0x444A5E],
    ['trim0', 0xFF6A50],
    ['glass0', 0xA6F2FF], ['glass1', 0x2C74AE], ['glass2', 0x163A62],
    ['metal', 0x2A2A34],
    // the foe fighter (gunmetal)
    ['foe0', 0xA4AEBA], ['foe1', 0x6C7888], ['foe2', 0x444E5C], ['foe3', 0x252B36],
    // the bomber (olive drab)
    ['olive0', 0xAEAA7C], ['olive1', 0x7C7A52], ['olive2', 0x4E4E34], ['olive3', 0x2C2C1E],
    // the fortress (plum steel)
    ['fort0', 0xC0ACB6], ['fort1', 0x8C7684], ['fort2', 0x5E4C5E], ['fort3', 0x342838],
    // fire and smoke
    ['fire0', 0xFFF4A8], ['smoke2', 0x9A8C88], ['smoke0', 0x6A5A56], ['smoke1', 0x3A302E],
    // clouds (white on top)
    ['cloud1', 0xE2EAF6], ['cloud2', 0xB6C4DA], ['cloud3', 0x8494B4],
    // STAGE 1 · OPEN SEA (sky: horizon haze > zenith; sea: near > far)
    ['s1sky0', 0xE0F0FF], ['s1sky1', 0xB0D6FA], ['s1sky2', 0x80B6F2], ['s1sky3', 0x5494E6], ['s1sky4', 0x3474D6], ['s1sky5', 0x1E54BA],
    ['sea0', 0x0C2C74], ['sea1', 0x16449C], ['sea2', 0x245AB0], ['sea3', 0x3672C2], ['sea4', 0x5A92D4], ['sea5', 0x8EB8E6],
    ['seaHi', 0x1E52AE],
    // STAGE 2 · RED DESERT
    ['s2sky0', 0xF6E8C4], ['s2sky1', 0xDCD6C4], ['s2sky2', 0xA8C0D8], ['s2sky3', 0x7AA2D6], ['s2sky4', 0x5282CA], ['s2sky5', 0x3462B4],
    ['sand0', 0xA45A24], ['sand1', 0xC27632], ['sand2', 0xCE8A46], ['sand3', 0xDAA05E], ['sand4', 0xE6BC82], ['sand5', 0xEED2A4],
    ['sandHi', 0xB86A2C],
    ['mesa0', 0xB88478], ['mesa1', 0x9A6A66], ['mesa2', 0x7A5058],
    // STAGE 3 · AFTERGLOW CANYON (sky: horizon gold > zenith violet)
    ['s3sky0', 0xFFC252], ['s3sky1', 0xF88A4A], ['s3sky2', 0xDC5068], ['s3sky3', 0xA02E7A], ['s3sky4', 0x641C6C], ['s3sky5', 0x301250],
    ['sun0', 0xFFF4B0], ['sun1', 0xFFD868],
    ['rock0', 0xD86A40], ['rock1', 0xB04C36], ['rock2', 0x843630], ['rock3', 0x5A2429], ['rock4', 0x361622],
    ['floor0', 0x4C2438], ['floor1', 0x341A2C], ['floor2', 0x6C3446], ['floor3', 0x8E4450],
    ['river0', 0xFFB45A], ['river1', 0xE0784E],
    // ships at sea, spires in the desert
    ['hull0', 0x8A96A8], ['hull1', 0x5A6478], ['hull2', 0x363C4C],
    ['wake', 0xC8DCF4],
).roles('bg', 'white', 'orange', 'yellow', 'darkRed');

export const PI = AfterglowPalette;
// palette index by name (the pre-renderer and the renderer work in indices)
export function ix(name) { return AfterglowPalette.indexOf(name); }
export function ramp(...names) { return names.map(ix); }

// packed RGBA of every palette index, for direct Uint32 writes
export const PAL32 = (() => {
    const a = new Uint32Array(AfterglowPalette.count);
    for (let i = 0; i < a.length; i++) a[i] = AfterglowPalette.at(i).packed;
    return a;
})();
