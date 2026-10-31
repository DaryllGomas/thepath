// THE NODE · world 1 · NEBULA RUN on the Cabinet Engine · THE FIVE SECTORS (data only).
//
// A game is five sectors flown in order. Each one is a vertical scroll over its own ground (the renderer's `ground`
// style) that parks under a BOSS at its end; the fifth boss is the MOTHER FORTRESS and bringing it down wins the game.
// Each sector teaches one new thing (the `hint` on its card) on top of everything before it:
//
//   1 THE SHOALS         the gun and the bomb: spinners, darts, silos, turrets, a tank on its causeway, supply dumps
//                        BOSS  the RADAR ISLE: four cores round a sweeping radar; a live core fires as the sweep crosses it
//   2 THE CRATER BELT    FLAK (a shell climbs to where you are and bursts there), armour convoys that shoot back, discs
//                        BOSS  the CRAWLER: a giant tank pacing the crater floor; its two flak towers guard the engine
//   3 THE CITY OF GLASS  SHIELD GENERATORS: a domed turret shrugs off bombs until its generator goes; weavers
//                        BOSS  the PRISM: three generators hold a shield over the prism heart, which fires fans
//   4 THE STORM          LIGHTNING columns (a dotted warning, then the bolt) and drifting MINES that burst when armed
//                        BOSS  the THUNDERHEAD: an AIR boss (the gun, not the bomb): two wing pods, then the eye
//   5 THE MOTHER FORTRESS armour plate, bunkers, everything at once: the approach is the gauntlet
//                        BOSS  the MOTHER FORTRESS: guns, flak, hangars, two generators and the iris core that opens
//
//   seconds   of scroll from the start to the parked boss (x the scrollSpeed knob = the sector's length in px)
//   gap       map px between ground groups [min, max]
//   groups    weights of the ground groups the map builder rolls (round.js _buildMap)
//   fixed     progress points (0..1) where a group always stands (tanks on their roads, supply dumps)
//   air       weights of the interceptor groups; airMul x the airRate knob; bossAir x that during the boss
//   heat      shotMul (enemy shot speed), fireMul (x every gun's gap: lower fires faster)
//   carriers  progress points where a pod CARRIER crosses (shoot it: it drops a power-up pod)
//   bolts     lightning columns fall during the run (the boltGap knob)
//   tankFire  the tanks shoot back (from the crater belt on)
export const SECTORS = Object.freeze([
    {
        name: 'THE SHOALS', hint: 'GUN THE SKY. BOMB THE GROUND.', ground: 'shoals',
        seconds: 40, gap: [74, 100],
        groups: { silos: 5, turret: 3, turretSilo: 2 },
        fixed: { tank: [0.36, 0.72], dump: [0.22, 0.56] },
        air: { spinner: 6, dart: 3 }, airMul: 0.78, bossAir: 0.35,
        shotMul: 0.92, fireMul: 1.2,
        carriers: [0.42], bolts: false, tankFire: false,
        boss: 'radar', bossName: 'THE RADAR ISLE', bossScreenY: 86,
    },
    {
        name: 'THE CRATER BELT', hint: 'FLAK BURSTS WHERE YOU FLY', ground: 'craters',
        seconds: 44, gap: [66, 90],
        groups: { silos: 2, turret: 2, flak: 3, convoy: 2, turretSilo: 1 },
        fixed: { dump: [0.3, 0.68] },
        air: { spinner: 4, dart: 3, disc: 1.2 }, airMul: 0.9, bossAir: 0.25,
        shotMul: 0.98, fireMul: 1.08,
        carriers: [0.18, 0.6], bolts: false, tankFire: true,
        boss: 'crawler', bossName: 'THE CRAWLER', bossScreenY: 84,
    },
    {
        name: 'THE CITY OF GLASS', hint: 'BOMB THE GENERATOR FIRST', ground: 'city',
        seconds: 46, gap: [66, 90],
        groups: { shield: 4, silos: 2, turret: 2, flak: 1 },
        fixed: { dump: [0.26, 0.64] },
        air: { spinner: 3, dart: 2, weaver: 3, disc: 1 }, airMul: 0.96, bossAir: 0.25,
        shotMul: 1.02, fireMul: 1.0,
        carriers: [0.2, 0.55], bolts: false, tankFire: true,
        boss: 'prism', bossName: 'THE PRISM', bossScreenY: 84,
    },
    {
        name: 'THE STORM', hint: 'WATCH THE SKY FOR LIGHTNING', ground: 'storm',
        seconds: 46, gap: [70, 96],
        groups: { turret: 2, flak: 2, silos: 2, shield: 1, convoy: 1 },
        fixed: { dump: [0.24, 0.6] },
        air: { spinner: 3, dart: 2, weaver: 2, mine: 3, disc: 0.8 }, airMul: 1.0, bossAir: 0,
        shotMul: 1.05, fireMul: 0.96,
        carriers: [0.22, 0.58], bolts: true, tankFire: true,
        boss: 'thunderhead', bossName: 'THE THUNDERHEAD', bossScreenY: 84,
    },
    {
        name: 'THE MOTHER FORTRESS', hint: 'OPEN THE CORE. END IT.', ground: 'fortress',
        seconds: 46, gap: [62, 86],
        groups: { bunker: 3, flak: 2, shield: 2, turret: 2, convoy: 1, silos: 1 },
        fixed: { dump: [0.2, 0.52] },
        air: { spinner: 3, dart: 3, weaver: 2, mine: 2, disc: 1 }, airMul: 1.04, bossAir: 0.2,
        shotMul: 1.08, fireMul: 0.92,
        carriers: [0.16, 0.46], bolts: false, tankFire: true,
        boss: 'mother', bossName: 'THE MOTHER FORTRESS', bossScreenY: 84,
    },
]);

export const SectorCount = SECTORS.length;
