// THE NODE · world 1 · AFTERGLOW on the Cabinet Engine · THE CARTRIDGE: spec + factories.
// Not yet in cartridges.js: the Lab finds it by its folder (node lab/lab.mjs all afterglow).
import { CabinetCartridge } from '../../sdk/index.js';
import { AfterglowSpec, AfterglowPalette } from './spec.js';
import { AfterglowRound } from './round.js';
import { AfterglowRenderer } from './renderer.js';
import { AfterglowBot } from './bot.js';
import { AfterglowWorld } from './world.js';

export const AfterglowCartridge = new CabinetCartridge(
    AfterglowSpec, () => new AfterglowRound(), () => new AfterglowRenderer(), () => new AfterglowBot());

export { AfterglowSpec, AfterglowPalette, AfterglowRound, AfterglowRenderer, AfterglowBot, AfterglowWorld };
