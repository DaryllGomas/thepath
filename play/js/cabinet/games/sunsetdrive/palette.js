// THE NODE · world 1 · SUNSET DRIVE · THE PALETTE (data only).
//
// A late-'80s sprite-scaler board had thousands of colours; this cabinet uses a fixed list of about
// 190, named, and every pixel it draws is one of them (CabinetChecks). The first 36 entries are the
// ones the title art (a PixelSprite, letters 0-9 a-z) can use. Four sunset skies of ten bands each, four
// terrains, the sea, the road, the sprites, the HUD.
import { Palette } from '../../sdk/index.js';

const CORE = [
    ['bg', 0x000000],        // 0 the tube border
    ['white', 0xFFFFFF],     // 1
    ['cream', 0xFFF1C8],     // 2
    ['yellow', 0xFFE23A],    // 3
    ['orange', 0xFF9A2A],    // 4
    ['pink', 0xFF4F8B],      // 5 hot pink
    ['magenta', 0xD02C8C],   // 6
    ['purple', 0x7A2A9A],    // 7
    ['violet', 0x3E1A6E],    // 8
    ['navy', 0x161A4A],      // 9
    ['red', 0xE4202E],       // a the car
    ['redHi', 0xFF7060],     // b
    ['redLo', 0x8A0E22],     // c
    ['ink', 0x140C1C],       // d outlines, shadows
    ['asphalt', 0x6A6676],   // e road, light band
    ['asphaltLo', 0x5F5B6B], // f road, dark band
    ['sea', 0x2C6CC0],       // g
    ['seaHi', 0x5AA8E6],     // h
    ['seaLo', 0x1A3E86],     // i
    ['sand', 0xEEC68A],      // j
    ['sandLo', 0xD8AA6E],    // k
    ['palm', 0x2E9A46],      // l
    ['palmLo', 0x146030],    // m
    ['trunk', 0x9A6436],     // n
    ['trunkLo', 0x603A1E],   // o
    ['sunHi', 0xFFF4A0],     // p
    ['sun', 0xFFC846],       // q
    ['sunLo', 0xFF7E4A],     // r
    ['skin', 0xF2B48C],      // s
    ['hair', 0x3A2418],      // t
    ['blonde', 0xFFD470],    // u
    ['chrome', 0xD8DEEC],    // v
    ['tyre', 0x1C1822],      // w
    ['glass', 0x243052],     // x
    ['grey', 0x8E8A9C],      // y
    ['greyLo', 0x3E3A4C],    // z
];

// four skies, top to horizon (10 bands each): the sun goes down as you drive
const SKIES = [
    ['coast', [0x1E2A78, 0x2E3488, 0x483C98, 0x6A44A0, 0x9A4CA0, 0xC8589A, 0xE86A8C, 0xFF8878, 0xFFA868, 0xFFC860]],
    ['canyon', [0x24205E, 0x3A2470, 0x582A7C, 0x7E3080, 0xA83A7C, 0xD04A70, 0xEE6464, 0xFF8656, 0xFFA64A, 0xFFC64A]],
    ['hills', [0x1C2466, 0x2C2C7A, 0x44348C, 0x62409A, 0x8C4CA4, 0xB458A8, 0xD8689E, 0xF47E92, 0xFF9C88, 0xFFBC84]],
    ['bay', [0x0E0A34, 0x1A0E48, 0x2C125A, 0x44186A, 0x621E76, 0x86267C, 0xAE307C, 0xD4407A, 0xF45E6E, 0xFF8A5C]],
];

const REST = [
    // the ground, light / dark band per terrain, and a far-haze step toward the horizon
    ['gCoast', 0xEEC68A], ['gCoastLo', 0xE2B87C], ['gCoastFar', 0xF2BE8C],
    ['gCanyon', 0xD8743C], ['gCanyonLo', 0xC8663A], ['gCanyonFar', 0xE0885A],
    ['gHills', 0x58B040], ['gHillsLo', 0x4CA238], ['gHillsFar', 0x7AA464],
    ['gBay', 0xDCAA7E], ['gBayLo', 0xD09E74], ['gBayFar', 0xD8927E],
    // the sea beside the road, its foam, and the open sea under the horizon (afternoon, dusk)
    ['seaBand', 0x2C6CC0], ['seaBandLo', 0x2862B4], ['foam', 0xE8F4FF], ['foamLo', 0x9ACCF0],
    ['seaFar0', 0x7A86CC], ['seaFar1', 0x5A78C4], ['seaFar2', 0x3E68BA], ['seaFar3', 0x3060B4],
    ['duskSeaBand', 0x3A3A96], ['duskSeaBandLo', 0x34348C],
    ['duskSea0', 0xB0507E], ['duskSea1', 0x7A3A86], ['duskSea2', 0x523282], ['duskSea3', 0x3A2E7A],
    ['glint', 0xFFE8A0],
    // the road
    ['lane', 0xF4F0F8], ['edge', 0xEDE6D8], ['rumbleW', 0xF4F0F8],
    // background silhouettes: far layer, its sunlit rim, near layer, its rim, the land under the horizon
    ['coastFar', 0x8A5AA6], ['coastFarRim', 0xE08CB0],
    ['canyonFar', 0x9A4A6A], ['canyonFarRim', 0xF09070], ['canyonNear', 0x6A2E4A], ['canyonNearRim', 0xC0605A], ['canyonLand', 0xC87050],
    ['hillsFar', 0x5A5AA0], ['hillsFarRim', 0xB098D0], ['hillsNear', 0x2E7A58], ['hillsNearRim', 0x78C060], ['hillsLand', 0x3E8E4E],
    ['city', 0x2A1A4A], ['cityRim', 0x7A3A7A], ['bayFar', 0x4A2A6A], ['bayFarRim', 0xC05A8A], ['winLit', 0xFFD86A], ['winWarm', 0xFF9A5A],
    // the sun's lower stripes, the clouds
    ['sunPink', 0xFF5C6C], ['sunDeep', 0xE8406E],
    ['cloudHi', 0xFFB8A0], ['cloud', 0xE87898], ['cloudLo', 0x9A4A8E], ['cloudDusk', 0x5A2A6A], ['cloudDuskHi', 0xC8587E],
    // sprites: palms and plants
    ['palmHi', 0x5CC854], ['cactusHi', 0x86CC5C], ['cactus', 0x44943C], ['cactusLo', 0x24582A],
    ['cypHi', 0x3E9A4A], ['cyp', 0x1E6A3C], ['cypLo', 0x0E3C24],
    // rocks: canyon red, coast grey
    ['rockHi', 0xF09A64], ['rock', 0xC0603C], ['rockLo', 0x7A3428], ['rockDk', 0x4A1E22],
    ['stoneHi', 0xCCC4D0], ['stone', 0x948EA2], ['stoneLo', 0x5C566A],
    // wood, paint, signs
    ['woodHi', 0xDCA464], ['wood', 0xA46C3A], ['woodLo', 0x6A4020],
    ['teal', 0x22BCB4], ['tealLo', 0x107A72], ['lime', 0xBCF044], ['sky', 0x5CCAF8], ['skyLo', 0x2A8AC8],
    ['signY', 0xFFD02A], ['signYLo', 0xC8940E],
    ['neonCyan', 0x40ECFA],
    // traffic paint (hi / body / lo)
    ['blueHi', 0x6A9AF8], ['blue', 0x2E62D8], ['blueLo', 0x1C3C94],
    ['whiteCar', 0xF0F0F4], ['whiteCarLo', 0xB4B4C6], ['whiteCarDk', 0x7C7C92],
    ['yelHi', 0xFFE880], ['yel', 0xFFC62A], ['yelLo', 0xB88A10],
    ['grnHi', 0x7ADA86], ['grn', 0x2E9E5A], ['grnLo', 0x1A6038],
    ['tan', 0xC8A078], ['tanLo', 0x8E6A4C],
    ['black', 0x2A2634], ['blackHi', 0x4E4A5E],
    // the player's car
    ['redMid', 0xC4162A], ['tailOff', 0x7A0A1A], ['tailOn', 0xFF3A3A], ['tailCore', 0xFFD8C8],
    ['seat', 0x2A1A24], ['plate', 0xF4F0E0], ['shadow', 0x2A2436],
    // smoke, dust, sparks
    ['smokeHi', 0xECE8F4], ['smoke', 0xBCB8CC], ['smokeLo', 0x8C88A2],
    ['spark', 0xFFF6B0],
    // HUD
    ['hudPlate', 0x1A1030], ['hudDim', 0x6A5A8A], ['tachG', 0x52E05A], ['tachGLo', 0x1E5A2A], ['tachY', 0xFFE23A], ['tachR', 0xFF3A3A], ['tachOff', 0x3A2E4E],
    ['mapRoad', 0x8A7AAA],
];

function build() {
    const entries = [...CORE];
    for (const [name, bands] of SKIES) bands.forEach((c, i) => entries.push(['sky_' + name + i, c]));
    entries.push(...REST);
    // a colour may appear under two names (the palette's member set does not mind); names must be unique
    const seen = new Set();
    for (const [n] of entries) { if (seen.has(n)) throw new Error('sunsetdrive palette: duplicate name ' + n); seen.add(n); }
    return new Palette(...entries).roles('bg', 'cream', 'pink', 'yellow', 'violet');
}

export const SunsetPalette = build();
export const SKY_NAMES = SKIES.map(s => s[0]);

// packed RGBA of a named colour (what the fast span fills write)
export function P(name) { return SunsetPalette.get(name).packed; }
