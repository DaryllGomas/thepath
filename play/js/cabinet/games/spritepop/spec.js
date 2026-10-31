// THE NODE · world 1 · SPRITE POP (Wavecrest Interactive, 1986) on the Cabinet Engine · the palette and
// the SPEC (data only). Began as a port of SpritePopCartridge.cs (Staging/Batch2/spritepop); rebuilt as the
// seven-stage tower on 2026-10-18 (see NOTES.md).
// Split from cartridge.js so the renderer and the round can read it without an import cycle.
//
// Palette: a candy-night background with an indigo drop shadow, platform pink (+ light, dark),
// candy blue (+ light, dark) and bubble white, creature green (+ dark), the cub's lime (+ dark) and yellow,
// orange (feet, keys, beaks), red (+ dark, + rose) for ANGRY creatures and cherries, and three more
// block families for the upper floors: brown (the alley's bricks), violet (the attic) and steel (the king).
//
// Knobs (Lab: --knob name=value tunes the BASE; mercy eases it per lost credit):
//   creatureSpeed  x0.87 per loss   THE CORE MERCY: every creature 13% slower per loss (and the king)
//   catchRadius    +2 px per loss   THE CORE MERCY: a bubble grabs from further away
//   kingHits       -1 per loss      sparks the Tin King takes before he is bubbled
//   ...the rest are fixed: trap time, anger, the hurry-up and the alarm, fruit, lives, the extra lives.
//   startStage is a test knob (the Lab's --knob startStage=7 opens on the king).
// The unlosable credit (5) is a RULE in the sim: creatures drift instead of hunting, nothing spits or
// throws at the cub, no alarm comes, and the cub cannot die.
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
    ['blueLight', 0xA8DCFF],
    ['rose', 0xFF96A6],
    ['brown', 0x8A4A1C],
    ['violet', 0x9A5CFF],
    ['violetLight', 0xD2B8FF],
    ['violetDark', 0x4A2696],
    ['steel', 0x8C98BE],
    ['steelLight', 0xD4DCF0],
    ['steelDark', 0x46506E],
).roles('bg', 'white', 'pink', 'blue', 'blueDark');

function buildSpec() {
    const s = new CabinetGameSpec({
        id: 'spritepop',
        name: 'SPRITE POP',
        publisher: 'WAVECREST INTERACTIVE',
        year: 1986,
        palette: SpritePopPalette,
        tagline: 'CLIMB THE TOY TOWER  POP THE TIN KING',
        controls: ['STICK  WALK   UP OR B  JUMP', 'A  BLOW A BUBBLE  TOUCH IT TO POP'],
        hints: [['LR', 'WALK'], ['UP', 'JUMP'], ['A', 'BLOW BUBBLE'], ['B', 'JUMP']],
        roundWonText: 'TOWER CLEARED',
        roundLostText: 'GAME OVER',
        highScoreSeed: [120000, 90000, 60000, 40000, 25000],
        titleArt: titleArt(SpritePopPalette),
        titleArtScale: 2,
        knobs: [
            Knob.mul('creatureSpeed', 0.85, 0.87, 'x creature speed (walk 41.6, fly 39 px/s, x the stage pace); Core mercy -13% per loss').clamp(0.3, 2),
            Knob.add('catchRadius', 12, 2, 'px, bubble centre to creature centre that traps it; Core mercy +2 per loss (the bubble grows)').clamp(8, 24),
            Knob.add('kingHits', 8, -1, 'sparks the Tin King takes before he is bubbled; -1 per loss').clamp(4, 20),
            Knob.fixed('trapSeconds', 6, 'a trapped creature breaks out after this, angry'),
            Knob.fixed('angryMul', 1.5, 'speed x when angry (broke out, or HURRY UP)'),
            Knob.fixed('chase', 1, "x each stage's chance that a creature's decision turns it toward the cub"),
            Knob.fixed('jumpChance', 0.3, 'chance a wind-up jumps up when the cub is above it'),
            Knob.fixed('hurrySeconds', 45, "seconds of a stage before HURRY UP (x the stage's own factor)"),
            Knob.fixed('alarmDelay', 12, 'seconds after HURRY UP that the alarm clock comes for the cub'),
            Knob.fixed('fruitSeconds', 8, 'how long fruit lies before it goes'),
            Knob.fixed('lives', 5, 'lives per coin'),
            Knob.fixed('extraLifeAt', 20000, 'score for the first extra life'),
            Knob.fixed('extraLifeEvery', 30000, 'score between the later extra lives'),
            Knob.fixed('warmup', 20, 'seconds of a stage over which creatures wind up from 70% to full speed'),
            Knob.fixed('startStage', 1, 'the stage a coin starts on (a test knob: 1 in play)'),
        ],
    });
    s.phaseNames.set(CabinetState.Intro, 'ready');
    s.phaseNames.set(CabinetState.Playing, 'play');
    s.phaseNames.set(CabinetState.Interlude, 'ouch');
    return s;
}

export const SpritePopSpec = buildSpec();
