// THE NODE · world 1 · TUNNEL RAT on the Cabinet Engine · THE EIGHT DEPTHS (data only).
//
// A coin buys a dig down through eight depths. Each one has its own earth (four strata in its own colours,
// lighter on top), its own sky (day, dusk, night as you go down), and one new thing; the eighth is the
// QUEEN's nest, and popping her wins the game.
//
//   name, hint (two lines for the depth card), feature (what the card shows: a pest kind, 'chain' or 'queen')
//   earth / speck / lip    palette names per stratum (top to bottom)      sky    'sky' | 'dusk' | 'night'
//   bugs lizards drillers shades scorchers    pests in pockets (bugs and lizards scale with the crowd knob)
//   rocks     single rocks        chains    stacks of two rocks (the bottom one drops, the top one follows)
//   warrens   old tunnels already dug between the pockets (the pests are loose from the start)
//   speed     x every pest's speed       ghost     x the ghosting rate       flee   the last pest runs for the sky
//   veg       the bonus vegetable after two rocks: its sprite index (renderer) and its points
//   par       seconds: the SPEED BONUS counts 20 a second under it
export const STAGES = Object.freeze([
    {
        name: 'TOPSOIL', hint: ['HOLD A TO PUMP. 4 PUMPS POP.', 'DIG UNDER A ROCK TO DROP IT'], feature: 'bug',
        earth: ['dirt1', 'dirt2', 'dirt3', 'dirt4'], speck: ['dirt2', 'dirt3', 'dirt4', 'dirt3'], lip: ['dirt2', 'dirt3', 'dirt4', 'dirt3'],
        sky: 'sky', bugs: 4, lizards: 0, drillers: 0, shades: 0, scorchers: 0, rocks: 4, chains: 0, warrens: 0,
        speed: 0.85, ghost: 0.45, flee: false, veg: 0, vegPoints: 400, par: 45,
    },
    {
        name: 'RED CLAY', hint: ['LIZARDS BREATHE FIRE IN TUNNELS', 'THE LAST PEST RUNS FOR THE SKY'], feature: 'lizard',
        earth: ['clay1', 'clay2', 'clay3', 'clay4'], speck: ['clay2', 'clay3', 'clay4', 'clay3'], lip: ['clay2', 'clay3', 'clay4', 'clay3'],
        sky: 'sky', bugs: 3, lizards: 2, drillers: 0, shades: 0, scorchers: 0, rocks: 4, chains: 0, warrens: 0,
        speed: 0.9, ghost: 0.7, flee: true, veg: 1, vegPoints: 600, par: 50,
    },
    {
        name: 'GRAVEL BED', hint: ['STACKED ROCKS FALL IN CHAINS', 'A CHAINED ROCK PAYS DOUBLE'], feature: 'chain',
        earth: ['grav1', 'grav2', 'grav3', 'grav4'], speck: ['grav2', 'grav3', 'grav4', 'grav3'], lip: ['grav2', 'grav3', 'grav4', 'grav3'],
        sky: 'sky', bugs: 4, lizards: 2, drillers: 0, shades: 0, scorchers: 0, rocks: 2, chains: 2, warrens: 0,
        speed: 0.95, ghost: 0.85, flee: true, veg: 2, vegPoints: 800, par: 55,
    },
    {
        name: 'ROOT MAZE', hint: ['DRILLERS BORE NEW TUNNELS', 'AND UNDERMINE THE ROCKS'], feature: 'driller',
        earth: ['loam1', 'loam2', 'loam3', 'loam4'], speck: ['loam2', 'loam3', 'loam4', 'loam3'], lip: ['loam2', 'loam3', 'loam4', 'loam3'],
        sky: 'dusk', bugs: 3, lizards: 1, drillers: 2, shades: 0, scorchers: 0, rocks: 4, chains: 1, warrens: 0,
        speed: 1.0, ghost: 0.9, flee: true, veg: 3, vegPoints: 1000, par: 55,
    },
    {
        name: 'SLATE', hint: ['SHADES DRIFT THROUGH THE EARTH', 'PUMP THEM WHEN THEY COME OUT'], feature: 'shade',
        earth: ['slate1', 'slate2', 'slate3', 'slate4'], speck: ['slate2', 'slate3', 'slate4', 'slate3'], lip: ['slate2', 'slate3', 'slate4', 'slate3'],
        sky: 'dusk', bugs: 3, lizards: 1, drillers: 0, shades: 2, scorchers: 0, rocks: 4, chains: 1, warrens: 0,
        speed: 1.0, ghost: 1.0, flee: true, veg: 4, vegPoints: 2000, par: 55,
    },
    {
        name: 'COAL SEAM', hint: ['SCORCHERS BURN THROUGH EARTH', 'RUN FROM THE EMBER LINE'], feature: 'scorcher',
        earth: ['coal1', 'coal2', 'coal3', 'coal4'], speck: ['coal2', 'red', 'redDk', 'redDk'], lip: ['coal2', 'coal3', 'coal4', 'coal3'],
        sky: 'dusk', bugs: 2, lizards: 1, drillers: 1, shades: 0, scorchers: 2, rocks: 4, chains: 1, warrens: 0,
        speed: 1.0, ghost: 1.05, flee: true, veg: 5, vegPoints: 3000, par: 60,
    },
    {
        name: 'THE WARRENS', hint: ['OLD TUNNELS EVERYWHERE', 'EVERY PEST IS LOOSE AT ONCE'], feature: 'warren',
        earth: ['deep1', 'deep2', 'deep3', 'deep4'], speck: ['deep2', 'deep3', 'deep4', 'deep3'], lip: ['deep2', 'deep3', 'deep4', 'deep3'],
        sky: 'night', bugs: 3, lizards: 1, drillers: 1, shades: 1, scorchers: 1, rocks: 5, chains: 1, warrens: 1,
        speed: 1.0, ghost: 1.0, flee: true, veg: 6, vegPoints: 4000, par: 60,
    },
    {
        name: 'THE QUEEN\'S NEST', hint: ['PUMP THE QUEEN AND HOLD ON', 'LET GO AND SHE SHRINKS BACK'], feature: 'queen',
        earth: ['magma1', 'magma2', 'magma3', 'magma4'], speck: ['magma2', 'orangeDk', 'red', 'orange'], lip: ['magma2', 'magma3', 'magma4', 'magma3'],
        sky: 'night', bugs: 2, lizards: 0, drillers: 0, shades: 0, scorchers: 0, rocks: 5, chains: 1, warrens: 0,
        speed: 1.0, ghost: 0.6, flee: false, veg: 7, vegPoints: 5000, par: 70, queen: true,
    },
]);

export const StageCount = STAGES.length;
