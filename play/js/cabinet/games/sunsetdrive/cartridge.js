// THE NODE · world 1 · SUNSET DRIVE on the Cabinet Engine · THE CARTRIDGE: spec + factories.
// A late-'80s sit-down road racer (behind the car, sprite-scaled road). The data lives in spec.js.
import { CabinetCartridge } from '../../sdk/index.js';
import { SunsetSpec } from './spec.js';
import { SunsetPalette } from './palette.js';
import { SunsetRound } from './round.js';
import { SunsetRenderer } from './renderer.js';
import { SunsetBot } from './bot.js';

export const SunsetDriveCartridge = new CabinetCartridge(
    SunsetSpec, () => new SunsetRound(), () => new SunsetRenderer(), () => new SunsetBot());

export { SunsetSpec, SunsetPalette, SunsetRound, SunsetRenderer, SunsetBot };
