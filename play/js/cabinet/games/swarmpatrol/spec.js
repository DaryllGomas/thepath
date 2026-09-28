// THE NODE · world 1 · SWARM PATROL (Skyline Coin Corp, 1981) on the Cabinet Engine · palette + SPEC.
// Port of SwarmPatrolCartridge.cs from Staging/Batch1/swarmpatrol. Split from cartridge.js so the
// renderer and the round can read it without an import cycle.
//
// Palette: black, violet, hot pink, white, cyan for the player, plus one darker step of violet,
// pink and cyan (fades, starfield, title shadow; fades never blend).
// Knobs: diveSpeed and diveRate ease x0.92 per lost round (8% a loss); on the fifth credit
// diveDepth snaps to 0.2 (divers barely leave the ranks), bolts and beams switch off and the sim
// shields the ship.
import { Palette, PixelSprite, CabinetGameSpec, CabinetState, Knob } from '../../sdk/index.js';
import { Drone, Escort, Boss, Ship, iCyan, iWhite, iPink, stamp } from './sprites.js';

export const SwarmPatrolPalette = new Palette(
    ['bg', 0x000000],
    ['violet', 0xA84CFF],
    ['violetDim', 0x3A1466],
    ['pink', 0xFF2D95],
    ['pinkDim', 0x6A1040],
    ['white', 0xFFFFFF],
    ['cyan', 0x2EE6FF],
    ['cyanDim', 0x0E5566],
).roles('bg', 'white', 'pink', 'violet', 'violetDim');

// the title card's picture: the swarm's front rank, a shot going up, the ship below
function buildTitleArt() {
    // 88 x 27 at scale 2 = 176 x 54: fits the title card with both controls lines
    const art = new PixelSprite(88, 27);
    stamp(art, Drone[0], 0, 1);
    stamp(art, Escort[0], 17, 1);
    stamp(art, Boss[0], 36, 0);
    stamp(art, Escort[1], 55, 1);
    stamp(art, Drone[1], 74, 1);
    stamp(art, Ship, 36, 15);
    art.set(43, 13, iCyan); art.set(44, 13, iCyan);
    art.set(43, 14, iWhite); art.set(44, 14, iWhite);
    art.set(24, 17, iPink); art.set(24, 18, iWhite); art.set(24, 19, iPink);
    art.set(63, 20, iPink); art.set(63, 21, iWhite); art.set(63, 22, iPink);
    return art;
}

function buildSpec() {
    const s = new CabinetGameSpec({
        id: 'swarmpatrol',
        name: 'SWARM PATROL',
        publisher: 'SKYLINE COIN CORP',
        year: 1981,
        palette: SwarmPatrolPalette,
        tagline: 'FIVE WAVES  THREE SHIPS',
        controls: ['STICK  SLIDE LEFT AND RIGHT', 'A  FIRE  HOLD FOR AUTO'],
        roundWonText: 'ROUND WON',
        roundLostText: 'GAME OVER',
        highScoreSeed: [13500, 11000, 9000, 7000, 5000],   // a perfect round (every alien shot in flight) is 15000
        titleArt: buildTitleArt(),
        titleArtScale: 2,
        knobs: [
            Knob.mul('diveSpeed', 115, 0.92, 'px/s a diver falls at on wave 1').clamp(40, 400).capOnMercy(70),
            Knob.mul('diveRate', 1.1, 0.92, 'dives launched per second on wave 1').clamp(0.05, 4),
            Knob.fixed('waveRamp', 0.12, '+dive speed and +dive rate per wave after the first'),
            Knob.fixed('shotChance', 0.6, 'chance a diver drops each of its 2 bolts').setOnMercy(0),
            Knob.fixed('pairChance', 0.3, 'chance a dive brings a wingman (+5% a wave)'),
            Knob.fixed('beamChance', 0.35, 'chance a boss attack is a tractor-beam dive').setOnMercy(0),
            Knob.fixed('diveDepth', 1, '1 = a full dive through the lane; less turns home early').setOnMercy(0.2),
            Knob.fixed('boltSpeed', 1.5, 'a bolt falls at this multiple of its diver\'s speed'),
            Knob.fixed('captureSeconds', 0.9, 'seconds under an open beam before the ship is taken'),
        ],
    });
    s.phaseNames.set(CabinetState.Intro, 'countdown');
    s.phaseNames.set(CabinetState.Playing, 'patrol');
    s.phaseNames.set(CabinetState.Interlude, 'interlude');
    return s;
}

export const SwarmPatrolSpec = buildSpec();
