// THE NODE · the cabinet with no name · the palette and the SPEC (data only; split from cartridge.js so the
// renderers and the round can read it without an import cycle).
//
// NO NAME ANYWHERE: the spec's marquee name, publisher, tagline, controls card and copyright are all EMPTY. The
// cabinet's own attract loop (attract.js) never reads them; the Lab's generic SDK attract, which does, then shows
// no title, no maker and no copyright line either.
//
// MERCY, per round lost on this cabinet (credit N = N-1 losses, worst case):
//   credit 1  the machine as built: base rotation, tolerance, clock; eight symbols a level; a wrong node slips back
//   credit 2  rings turn at 0.8, +3 deg tolerance, the clock x1.2, seven symbols a level, the target's ring breathes
//   credit 3  CANNOT BE LOST (unlosable at 3 for this cabinet, not the SDK's 5): no clock, no roll-back, rings 0.64,
//             +6 deg, six symbols, the target's sector glows. Still played by the player's own hand.
import { Palette, CabinetGameSpec, CabinetState, Knob } from '../../sdk/index.js';
import { UNLOSABLE_AT } from './round.js';

// the CPU surface's palette (the Lab frames and the SDK checks). The showpiece canvas renderer uses the same hues.
export const NamelessPalette = new Palette(
    ['bg', 0x010306],          // 0 the tube
    ['lattice', 0x0B2E36],     // 1 the school's faint lines
    ['latticeHi', 0x17606A],   // 2 the school, coherent
    ['cyanDim', 0x136E80],     // 3 idle rings, dim HUD
    ['cyan', 0x3EE8FF],        // 4 the rings, the probe
    ['white', 0xEAFCFF],       // 5 the probe's core, the target symbol
    ['goldDim', 0x6E5214],     // 6 nodes far away, lit pips
    ['gold', 0xFFC84A],        // 7 the nodes
    ['magentaDim', 0x3E1A52],  // 8 wrong, faint vesica
    ['magenta', 0xD27CFF],     // 9 the vesica, the Sri Yantra
    ['green', 0x5DFF9A],       // a resonance
    ['amber', 0xFFA040],       // b the clock's last ten seconds (never red)
    ['gate', 0xFFE8B8],        // c THE GATE
).roles('bg', 'cyan', 'gold', 'white', 'cyanDim');

function buildSpec() {
    const s = new CabinetGameSpec({
        id: 'nameless',
        name: '',                          // no name. Never.
        publisher: '',
        year: 1981,
        palette: NamelessPalette,
        tagline: '',
        controls: [],
        roundWonText: '',
        roundLostText: '',
        highScoreSeed: [0, 18400, 15300, 12100, 9600],   // row 1 is the blank row (scores.js); a won run is ~20-30k
        knobs: [
            Knob.mul('spin', 1, 0.8, 'x ring rotation speed').clamp(0.5, 1),
            Knob.add('tolerance', 0, 3, '+ PULSE tolerance, degrees').clamp(0, 8),
            Knob.mul('time', 1, 1.2, 'x the level clock (0 = no clock: the unlosable credit)').clamp(1, 2).setOnMercy(0),
            Knob.add('targets', 8, -1, 'symbols to pulse per level').clamp(6, 8),
            Knob.fixed('rollback', 1, 'a wrong node slips resonance back one').setOnMercy(0),
            Knob.add('guide', 0, 1, 'guidance: 1 the target ring breathes, 2 its sector glows too').clamp(0, 2),
            Knob.fixed('probeSpeed', 150, 'orbit, degrees per second'),
        ],
    });
    s.unlosableAt = UNLOSABLE_AT;
    // the generic SDK attract (Lab only) prints spec.copyright: this cabinet has none
    Object.defineProperty(s, 'copyright', { value: '', writable: false });
    s.phaseNames.set(CabinetState.Intro, 'ready');
    s.phaseNames.set(CabinetState.Playing, 'play');
    s.phaseNames.set(CabinetState.Interlude, 'descend');
    return s;
}

export const NamelessSpec = buildSpec();
