// THE NODE · world 1 · SWARM PATROL (Skyline Coin Corp, 1981) on the Cabinet Engine · palette + SPEC.
// Started as a port of SwarmPatrolCartridge.cs from Staging/Batch1/swarmpatrol; built out on 2026-10-18 into a whole
// game for a coin (eight stages, two challenge stages, THE HIVE QUEEN). Split from cartridge.js so the renderer and the
// round can read it without an import cycle.
//
// Palette: black, violet, hot pink, white, cyan for the player, one darker step of violet, pink and cyan (fades, the
// starfield, the title shadow; fades never blend), plus the build-out's gold (the queen's crown, the stinger, bonuses)
// and steel (the iron shells, the queen's shut eye), each with its own dim step. Indices 0-7 never move.
// Knobs: diveSpeed and diveRate ease x0.92 per lost round (8% a loss) and the queen's armour thins a little per loss;
// on the fifth credit diveDepth snaps to 0.2 (divers barely leave the ranks), bolts and beams switch off and the sim
// shields the ship.
import { Palette, PixelSprite, CabinetGameSpec, CabinetState, Knob } from '../../sdk/index.js';
import { Drone, Escort, Boss, Stinger, Splitter, Ship, iCyan, iWhite, iPink, iGold, stamp } from './sprites.js';

export const SwarmPatrolPalette = new Palette(
    ['bg', 0x000000],
    ['violet', 0xA84CFF],
    ['violetDim', 0x3A1466],
    ['pink', 0xFF2D95],
    ['pinkDim', 0x6A1040],
    ['white', 0xFFFFFF],
    ['cyan', 0x2EE6FF],
    ['cyanDim', 0x0E5566],
    ['gold', 0xFFC83C],
    ['goldDim', 0x6E4E12],
    ['steel', 0x9C9CCC],
    ['steelDim', 0x3E3E62],
).roles('bg', 'white', 'pink', 'violet', 'violetDim');

// the title card's picture: the swarm's front rank (a stinger and a splitter among them), a shot going up, the ship below
function buildTitleArt() {
    // 88 x 27 at scale 2 = 176 x 54: fits the title card with both controls lines
    const art = new PixelSprite(88, 27);
    stamp(art, Drone[0], 0, 1);
    stamp(art, Splitter[0], 17, 1);
    stamp(art, Boss[0], 36, 0);
    stamp(art, Stinger[1], 56, 0);
    stamp(art, Escort[1], 72, 1);
    stamp(art, Ship, 36, 15);
    art.set(43, 13, iCyan); art.set(44, 13, iCyan);
    art.set(43, 14, iWhite); art.set(44, 14, iWhite);
    art.set(24, 17, iPink); art.set(24, 18, iWhite); art.set(24, 19, iPink);
    art.set(63, 20, iGold); art.set(63, 21, iWhite); art.set(63, 22, iGold);
    return art;
}

function buildSpec() {
    const s = new CabinetGameSpec({
        id: 'swarmpatrol',
        name: 'SWARM PATROL',
        publisher: 'SKYLINE COIN CORP',
        year: 1981,
        palette: SwarmPatrolPalette,
        tagline: 'EIGHT STAGES  ONE HIVE QUEEN',
        controls: ['STICK  SLIDE     A  FIRE  HOLD FOR AUTO', 'SHIP TAKEN? SHOOT ITS CAPTOR IN FLIGHT'],
        hints: [['LR', 'SLIDE'], ['A', 'FIRE (HOLD)']],
        roundWonText: 'HIVE BROKEN',
        roundLostText: 'GAME OVER',
        // a won game is about 60-80k; a decent run into stage 3 or 4 is about 12-20k
        highScoreSeed: [50000, 32000, 21000, 13000, 7000],
        titleArt: buildTitleArt(),
        titleArtScale: 2,
        knobs: [
            Knob.mul('diveSpeed', 100, 0.92, 'px/s a diver falls at on stage 1 (each stage multiplies it)').clamp(40, 400).capOnMercy(70),
            Knob.mul('diveRate', 1.0, 0.92, 'dives launched per second on stage 1 (each stage multiplies it)').clamp(0.05, 4),
            Knob.mul('shotChance', 0.4, 0.92, 'chance a diver drops each of its bolts').clamp(0.1, 1).setOnMercy(0),
            Knob.fixed('pairChance', 0.3, 'chance a dive brings a wingman (each stage adds to it)'),
            Knob.fixed('beamChance', 0.4, 'chance a boss attack is a tractor-beam dive (stages with beams)').setOnMercy(0),
            Knob.fixed('diveDepth', 1, '1 = a full dive through the lane; less turns home early').setOnMercy(0.2),
            Knob.fixed('boltSpeed', 1.5, 'a bolt falls at this multiple of its diver\'s speed'),
            Knob.fixed('captureSeconds', 0.9, 'seconds under an open beam before the ship is taken'),
            Knob.mul('queenArmour', 1, 0.94, 'x the hits the queen\'s wings and eye take (16, 16, 20)').clamp(0.5, 1),
        ],
    });
    s.phaseNames.set(CabinetState.Intro, 'stagecard');
    s.phaseNames.set(CabinetState.Playing, 'patrol');
    s.phaseNames.set(CabinetState.Interlude, 'tally');
    return s;
}

export const SwarmPatrolSpec = buildSpec();
