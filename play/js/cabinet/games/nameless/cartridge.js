// THE NODE · the cabinet with no name · THE CARTRIDGE: spec + factories (id 'nameless').
//
//   Cartridges.get('nameless')            the registry entry (js/cabinet/cartridges.js)
//   cart.newSim() / newBot()              the round and its bot, as every cartridge
//   cart.newRenderer()                    the CPU 320x240 PixelSurface picture (the Lab, the SDK checks,
//                                         and any host that only knows CabinetRunner)
//   cart.createRunner(opts)               THE SHOWPIECE: a NamelessRunner (runner.js) with CabinetRunner's API that
//                                         draws the high-resolution glowing canvas (runner.canvas -> CanvasTexture),
//                                         runs the nameless attract loop, the first-coin notice, reduced motion,
//                                         the 8 music-stem gains, and unlosable at credit 3. Browser only.
//
// startRound() (the Lab's path) re-makes the CreditInfo with unlosable at 3 before resolving the knobs, so the
// knobs' mercy snaps apply on this cabinet's third credit; the round itself enforces the rule whatever it is handed.
import { CabinetCartridge, CreditInfo, Mercy } from '../../sdk/index.js';
import { NamelessSpec, NamelessPalette } from './spec.js';
import { NamelessRound, UNLOSABLE_AT } from './round.js';
import { NamelessSurfaceRenderer } from './surface.js';
import { NamelessBot } from './bot.js';

class NamelessCartridgeClass extends CabinetCartridge {
    constructor() {
        super(NamelessSpec, () => new NamelessRound(), () => new NamelessSurfaceRenderer(), () => new NamelessBot('first'));
    }

    credit(number, lossesBefore) { return CreditInfo.make(number, lossesBefore, UNLOSABLE_AT); }

    startRound(seed, credit, baseOverrides) {
        const c = CreditInfo.make(credit.number, credit.lossesBefore, UNLOSABLE_AT);
        const s = this.newSim();
        s.reset(seed, c, Mercy.resolve(this.spec.knobs, c, baseOverrides));
        return s;
    }

    // the browser runner (lazy import: runner.js touches the DOM only when constructed)
    async createRunner(opts = {}) {
        const { NamelessRunner } = await import('./runner.js');
        return new NamelessRunner(opts);
    }
}

export const NamelessCartridge = new NamelessCartridgeClass();
export { NamelessSpec, NamelessPalette, NamelessRound, NamelessBot, UNLOSABLE_AT };
