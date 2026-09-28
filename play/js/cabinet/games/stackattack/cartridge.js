// THE NODE · world 1 · STACK ATTACK on the Cabinet Engine · THE CARTRIDGE: spec + factories
// (port of StackAttackCartridge.cs; the data lives in spec.js).
import { CabinetCartridge } from '../../sdk/index.js';
import { StackAttackSpec, StackAttackPalette } from './spec.js';
import { StackAttackSim } from './sim.js';
import { StackAttackRenderer } from './renderer.js';
import { StackAttackBot } from './bot.js';

export const StackAttackCartridge = new CabinetCartridge(
    StackAttackSpec, () => new StackAttackSim(), () => new StackAttackRenderer(), () => new StackAttackBot());

export { StackAttackSpec, StackAttackPalette, StackAttackSim, StackAttackRenderer, StackAttackBot };
