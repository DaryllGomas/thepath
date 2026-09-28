// THE NODE · CABINET ENGINE (JS) · what a game says about itself, and the cartridge that builds it
// (port of Core/CabinetGameSpec.cs).
//
// CabinetGameSpec is DATA: marquee (name, publisher, year), palette, controls card, round-won text,
// difficulty knobs, the seed scores of its high-score table, title art. The shared screens
// (AttractMode, the high-score page, the Lab's reports) read only this.
// CabinetCartridge is the spec plus three factories: a fresh sim, renderer and bot per round.
import { CabinetState, CabinetStateNames } from './cabinetsim.js';
import { Mercy } from './mercy.js';
import { RandomPilot } from './cabinetbot.js';

export class CabinetGameSpec {
    constructor(init = {}) {
        this.id = '';                          // the cartridge id: "gridcycles"
        this.name = '';                        // marquee text, upper case: "GRID CYCLES"
        this.publisher = '';                   // invented publisher, upper case
        this.year = 1982;
        this.palette = null;
        this.controls = [];                    // controls card lines: "STICK  STEER"
        this.tagline = '';
        this.roundWonText = 'ROUND WON';
        this.roundLostText = 'GAME OVER';
        this.highScoreSeed = [10000, 8000, 6000, 4000, 2000];
        this.knobs = [];
        this.titleArt = null;                  // optional PixelSprite, palette-indexed
        this.titleArtScale = 2;
        // what the Lab calls each state in frame names ("countdown", "duel", "derez"...)
        this.phaseNames = new Map([
            [CabinetState.Intro, 'intro'], [CabinetState.Playing, 'play'],
            [CabinetState.Interlude, 'interlude'], [CabinetState.Card, 'card'],
        ]);
        Object.assign(this, init);
    }

    get copyright() { return '© ' + this.year + ' ' + this.publisher; }

    phaseName(s) {
        const n = this.phaseNames.get(s);
        return n !== undefined ? n : CabinetStateNames[s].toLowerCase();
    }
}

export class CabinetCartridge {
    constructor(spec, sim, renderer, bot = null) {
        this.spec = spec;
        this._newSim = sim; this._newRenderer = renderer; this._newBot = bot;
    }

    get id() { return this.spec.id; }

    newSim() { return this._newSim(); }
    newRenderer() { return this._newRenderer(); }
    newBot() { return this._newBot ? this._newBot() : new RandomPilot(); }
    get hasOwnBot() { return this._newBot != null; }

    // a round ready to step: new sim, knobs eased for this credit
    startRound(seed, credit, baseOverrides) {
        const s = this.newSim();
        s.reset(seed, credit, Mercy.resolve(this.spec.knobs, credit, baseOverrides));
        return s;
    }
}
