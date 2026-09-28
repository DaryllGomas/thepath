// THE NODE · world 1 · SWARM PATROL on the Cabinet Engine · THE CARTRIDGE: spec + factories
// (port of SwarmPatrolCartridge.cs; the data lives in spec.js).
import { CabinetCartridge } from '../../sdk/index.js';
import { SwarmPatrolSpec, SwarmPatrolPalette } from './spec.js';
import { SwarmPatrolRound } from './round.js';
import { SwarmPatrolRenderer } from './renderer.js';
import { SwarmPatrolBot } from './bot.js';

export const SwarmPatrolCartridge = new CabinetCartridge(
    SwarmPatrolSpec, () => new SwarmPatrolRound(), () => new SwarmPatrolRenderer(), () => new SwarmPatrolBot());

export { SwarmPatrolSpec, SwarmPatrolPalette, SwarmPatrolRound, SwarmPatrolRenderer, SwarmPatrolBot };
