// THE NODE · CABINET ENGINE (JS) · every cartridge the arcade owns (port of Games/Cartridges.cs).
// ONE line per game: add yours to CARTRIDGES. The browser host, the Lab and the smoke page all look
// games up here.
//
//   import { Cartridges } from './cartridges.js';
//   Cartridges.get('gridcycles')          // by id (a Map)
//   Cartridges.find('GRID CYCLES')        // by id or marquee name, any case (C# Cartridges.Find)
//   Cartridges.all                        // [cartridge, ...]
import { GridCyclesCartridge } from './games/gridcycles/cartridge.js';
import { StarvectorCartridge } from './games/starvector/cartridge.js';
import { RelicQuestCartridge } from './games/relicquest/cartridge.js';
import { CastleCrushCartridge } from './games/castlecrush/cartridge.js';
import { LanceRiderCartridge } from './games/lancerider/cartridge.js';
import { LastHumanCartridge } from './games/lasthuman/cartridge.js';
import { LaneJumperCartridge } from './games/lanejumper/cartridge.js';
import { ShortOrderCartridge } from './games/shortorder/cartridge.js';
import { SpritePopCartridge } from './games/spritepop/cartridge.js';
import { HyperDriftCartridge } from './games/hyperdrift/cartridge.js';
import { IronDojoCartridge } from './games/irondojo/cartridge.js';
import { IronworksCartridge } from './games/ironworks/cartridge.js';
import { NebulaRunCartridge } from './games/nebularun/cartridge.js';
import { StackAttackCartridge } from './games/stackattack/cartridge.js';
import { TunnelRatCartridge } from './games/tunnelrat/cartridge.js';
import { VaultDiggerCartridge } from './games/vaultdigger/cartridge.js';
import { LastLightCartridge } from './games/lastlight/cartridge.js';
import { SporeFieldCartridge } from './games/sporefield/cartridge.js';
import { SwarmPatrolCartridge } from './games/swarmpatrol/cartridge.js';
import { AfterglowCartridge } from './games/afterglow/cartridge.js';
import { LunarDutyCartridge } from './games/lunarduty/cartridge.js';
import { MudMetalCartridge } from './games/mudmetal/cartridge.js';
import { Route9Cartridge } from './games/route9/cartridge.js';
import { SunsetDriveCartridge } from './games/sunsetdrive/cartridge.js';
import { WarlordsRoadCartridge } from './games/warlordsroad/cartridge.js';
import { DeepKeepCartridge } from './games/deepkeep/cartridge.js';

const CARTRIDGES = [
    GridCyclesCartridge,
    StarvectorCartridge,
    RelicQuestCartridge,
    CastleCrushCartridge,
    LanceRiderCartridge,
    LastHumanCartridge,
    LaneJumperCartridge,
    ShortOrderCartridge,
    SpritePopCartridge,
    HyperDriftCartridge,
    IronDojoCartridge,
    IronworksCartridge,
    NebulaRunCartridge,
    StackAttackCartridge,
    TunnelRatCartridge,
    VaultDiggerCartridge,
    LastLightCartridge,
    SporeFieldCartridge,
    SwarmPatrolCartridge,
    AfterglowCartridge,
    LunarDutyCartridge,
    MudMetalCartridge,
    Route9Cartridge,
    SunsetDriveCartridge,
    WarlordsRoadCartridge,
    DeepKeepCartridge,
    // next: stackattack, lancerider, ... (one line each)
];

const byId = new Map(CARTRIDGES.map(c => [c.id, c]));

export const Cartridges = {
    all: CARTRIDGES,
    ids: [...byId.keys()],
    get(id) { return byId.get(id) || null; },
    find(idOrName) {
        if (!idOrName) return null;
        const k = String(idOrName).toLowerCase();
        for (const c of CARTRIDGES)
            if (c.spec.id.toLowerCase() === k || c.spec.name.toLowerCase() === k) return c;
        return null;
    },
};

// the map id -> cartridge, for hosts that want a plain lookup
export const cartridgesById = byId;
export default Cartridges;
