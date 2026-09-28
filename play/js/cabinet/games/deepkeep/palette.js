// THE NODE · world 1 · THE DEEP KEEP · the palette (its own module: the sprites and the spec both read it).
import { Palette } from '../../sdk/index.js';

// Floors are a warm six-step ramp and walls a cool six-step ramp: the renderer lights them per pixel
// (torches on the walls, the hero's own glow) and dithers between the steps. Everything that moves or
// can be picked up is drawn at full brightness on top, so it always reads.
export const DeepKeepPalette = new Palette(
    ['bg', 0x000000],
    ['fl0', 0x120D09], ['fl1', 0x231910], ['fl2', 0x36281B], ['fl3', 0x4E3B28], ['fl4', 0x6B5237], ['fl5', 0x8E6E45],
    ['wl0', 0x10141C], ['wl1', 0x1E2533], ['wl2', 0x323D50], ['wl3', 0x4E5C74], ['wl4', 0x74849E], ['wl5', 0xA4B2C8],
    ['ember', 0x9A3014], ['torch', 0xF08A28], ['torchHi', 0xFFD860], ['white', 0xFFFFFF],
    ['skin', 0xE8B080], ['red', 0xD42C20], ['redLo', 0x6E140E], ['gold', 0xE8B838], ['goldLo', 0x8C6414],
    ['bone', 0xEEE2C2], ['boneLo', 0xA49474], ['ghost', 0xC4CCE6], ['ghostLo', 0x646E9C],
    ['green', 0x72AC3E], ['greenLo', 0x2E5418], ['purple', 0xA060E6], ['purpleLo', 0x4A2476],
    ['wood', 0x8E5C2C], ['woodLo', 0x4A2E14], ['blue', 0x58B8F4], ['blueLo', 0x1E4CA0],
    // each level's own stone (walls, then floors): the renderer swaps ramps per level
    ['mo0', 0x0F1712], ['mo1', 0x1B2A1F], ['mo2', 0x2C4230], ['mo3', 0x45603F], ['mo4', 0x6A8A5A], ['mo5', 0x9DB888],
    ['cl0', 0x1C0C08], ['cl1', 0x34160D], ['cl2', 0x572414], ['cl3', 0x7E3A1E], ['cl4', 0xA85A2E], ['cl5', 0xD8905A],
    ['vi0', 0x150F1C], ['vi1', 0x261B33], ['vi2', 0x3D2B52], ['vi3', 0x5B4378], ['vi4', 0x8269A2], ['vi5', 0xB39CCD],
    ['te0', 0x0B1516], ['te1', 0x142628], ['te2', 0x223D3D], ['te3', 0x355C58], ['te4', 0x55847C], ['te5', 0x88B6AA],
    ['sl0', 0x0E0E11], ['sl1', 0x1A1A1F], ['sl2', 0x2A2A31], ['sl3', 0x3E3E48], ['sl4', 0x575766], ['sl5', 0x7A7A8A],
    ['em0', 0x150806], ['em1', 0x26100A], ['em2', 0x3C1A10], ['em3', 0x572818], ['em4', 0x783A20], ['em5', 0x9C5530],
).roles('bg', 'bone', 'torch', 'torchHi', 'ember');
