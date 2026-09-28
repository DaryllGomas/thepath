// THE NODE · world 1 · SPRITE POP (Wavecrest Interactive, 1986) on the Cabinet Engine · the palette and
// the SPEC (data only). Port of SpritePopCartridge.cs (Staging/Batch2/spritepop).
// Split from cartridge.js so the renderer and the round can read it without an import cycle.
//
// Palette: a candy-night background with an indigo drop shadow, platform pink (+ light, dark),
// candy blue (+ dark) and bubble white, creature green (+ dark), the cub's lime (+ dark) and yellow,
// orange (feet, keys, beaks), and red (+ dark) for ANGRY creatures and cherries.
//
// Knobs (Lab: --knob name=value tunes the BASE; mercy eases it per lost credit):
//   creatureSpeed  x0.9 per loss    THE CORE MERCY: every creature 10% slower per loss
//   catchRadius    +2 px per loss   THE CORE MERCY: a bubble grabs from further away
//   ...the rest are fixed: trap time, anger, how hard they hunt, the hurry-up, fruit, lives, the count.
// The unlosable credit (5) is a RULE in the sim: creatures drift instead of hunting and the cub
// cannot die.
// C# bench (worst case, 200 rounds): 34.5 / 47 / 62.5 / 77 / 100 %, rounds 63-70 s.
import { Palette, CabinetGameSpec, CabinetState, Knob } from '../../sdk/index.js';
import { titleArt } from './art.js';

export const SpritePopPalette = new Palette(
    ['bg', 0x080A26],
    ['shadow', 0x221A5C],
    ['pink', 0xFF5AB4],
    ['pinkLight', 0xFFB4DE],
    ['pinkDark', 0x9E2676],
    ['blue', 0x3CAEFF],
    ['blueDark', 0x1E4EA8],
    ['white', 0xFFFFFF],
    ['green', 0x2EC456],
    ['greenDark', 0x0E6A2E],
    ['cub', 0x9CF046],
    ['cubDark', 0x3A8A1C],
    ['yellow', 0xFFE03A],
    ['orange', 0xFF8A1E],
    ['red', 0xF02A46],
    ['redDark', 0x8C1030],
).roles('bg', 'white', 'pink', 'blue', 'blueDark');

function buildSpec() {
    const s = new CabinetGameSpec({
        id: 'spritepop',
        name: 'SPRITE POP',
        publisher: 'WAVECREST INTERACTIVE',
        year: 1986,
        palette: SpritePopPalette,
        tagline: 'BLOW THEM UP  POP THEM ALL',
        controls: ['STICK  WALK   UP  JUMP', 'A  BLOW A BUBBLE'],
        roundWonText: 'ROUND WON',
        roundLostText: 'GAME OVER',
        highScoreSeed: [9000, 7500, 6000, 4500, 3000],
        titleArt: titleArt(SpritePopPalette),
        titleArtScale: 2,
        knobs: [
            Knob.mul('creatureSpeed', 1.0, 0.9, 'x creature speed (walk 41.6, fly 39 px/s); Core mercy -10% per loss').clamp(0.3, 2),
            Knob.add('catchRadius', 9.5, 2, 'px, bubble centre to creature centre that traps it; Core mercy +2 per loss (the bubble grows)').clamp(8, 24),
            Knob.fixed('trapSeconds', 6, 'a trapped creature breaks out after this, angry'),
            Knob.fixed('angryMul', 1.6, 'speed x when angry (broke out, or HURRY UP)'),
            Knob.fixed('chase', 0.6, "chance a creature's decision turns it toward the cub"),
            Knob.fixed('jumpChance', 0.3, 'chance a wind-up jumps up when the cub is above it'),
            Knob.fixed('hurrySeconds', 50, 'seconds of play before HURRY UP turns every creature angry'),
            Knob.fixed('fruitSeconds', 8, 'how long fruit lies before it goes'),
            Knob.fixed('lives', 3, 'lives per round'),
            Knob.fixed('creaturesMin', 8, 'creatures in a round, low'),
            Knob.fixed('creaturesMax', 10, 'creatures in a round, high'),
            Knob.fixed('whistlerShare', 0.25, "share of the round's creatures that are whistlers (fliers)"),
            Knob.fixed('startCreatures', 3, 'creatures on the screen at the bell; the rest drop in through the ceiling gap'),
            Knob.fixed('maxOnScreen', 5, 'most creatures out at once (free or in a bubble)'),
            Knob.fixed('arriveGap', 9, 'seconds between drop-ins (a steady clock; an empty screen is a lull)'),
            Knob.fixed('dodge', 0.7, 'chance a wind-up hops a bubble blown at it (x1.4 angry)'),
            Knob.fixed('warmup', 30, 'seconds of play over which creatures wind up from 70% to full speed'),
        ],
    });
    s.phaseNames.set(CabinetState.Intro, 'ready');
    s.phaseNames.set(CabinetState.Playing, 'play');
    s.phaseNames.set(CabinetState.Interlude, 'ouch');
    return s;
}

export const SpritePopSpec = buildSpec();
