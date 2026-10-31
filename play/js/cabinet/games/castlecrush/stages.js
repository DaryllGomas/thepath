// THE NODE · world 1 · CASTLE CRUSH (Ironclad Amusements, 1981) · THE SIX CASTLES (data only).
// The campaign the coin buys (2026-10-18 build-out): the march from the border to the warlord's
// citadel. round.js reads this; nothing here runs.
//
// The castle grid is 14 columns x 6 courses of 21 x 14 px blocks, its top course at y 44. Masonry:
//   s  grey stone       1 hit   10        w  wooden palisade   1 hit   10
//   m  mortared brick   2 hits  20        $  treasury gold     1 hit  100
//   I  iron-banded      3 hits  40        t  stone with a torch 1 hit  30 (it lights the night)
//   g  iron gate        3 hits  60        r  rune stone        1 hit   30 (the sorcerer regrows these)
//   #  living rock: never breaks, never counts; it holds up what stands on it
//   P  the portcullis's slot (the River Keep): bars that rise and fall, never break
//   .  open sky
// A block stands while a chain of blocks joins it to the bottom course or to rock; cut it loose and
// it shudders and falls (THE CRUMBLE). Every layout here starts fully supported (the build checks).
//
// Per castle: name, hint (the card's line), the banner's two columns (the keep), regions that pay
// TOWER / KEEP 500 when levelled, speed (x the stoneSpeed knob), archers (x the archerEvery knob,
// how many at once, fire arrows), the power-ups its gold-marked blocks deal (W wide, 3 split,
// S slow, F fire), whether one block hides a spare stone (+1), the defence it brings, and par
// seconds for the tally.

export const STAGES = Object.freeze([
    {
        name: 'THE BORDER FORT',
        hint: 'BREAK EVERY BLOCK  THE BANNER FALLS',
        layout: [
            '..............',
            '..............',
            's.s..s..s..s.s',
            'sss..smms..sss',
            'ssswws..swwsss',
            'ssswwsggswwsss',
        ],
        banner: [6, 7],
        regions: [['TOWER', 0, 2], ['KEEP', 5, 8], ['TOWER', 11, 13]],
        speed: 0.9, archerEvery: 1.5, archerMax: 1, fireArrows: false,
        powers: 'W3S', powerBlocks: 6, life: false,
        sky: 'dusk',
    },
    {
        name: 'THE RIVER KEEP',
        hint: 'THE PORTCULLIS RISES  STRIKE THE GOLD',
        layout: [
            '..............',
            's.s..I##I..s.s',
            'sms..#$$#..sms',
            'sss..#$$#..sss',
            'ssss.#PP#.ssss',
            'ssssssPPssssss',
        ],
        banner: [6, 7],
        regions: [['TOWER', 0, 3], ['TOWER', 10, 13]],
        speed: 0.97, archerEvery: 1.15, archerMax: 2, fireArrows: false,
        powers: 'W3SF', powerBlocks: 6, life: true,
        portcullis: { shut: 2.6, open: 3.2 },
        moat: true,
        sky: 'river',
    },
    {
        name: 'THE MOUNTAIN HOLD',
        hint: 'BALLISTAS AIM AT YOU  BREAK THEM',
        layout: [
            '..I........I..',
            '.sIs.s..s.sIs.',
            '.sms.sIIs.sms.',
            '#sss.smms.sss#',
            '##s#.sggs.#s##',
            '###...ss...###',
        ],
        banner: [6, 7],
        regions: [['TOWER', 1, 3], ['KEEP', 5, 8], ['TOWER', 10, 12]],
        speed: 1.0, archerEvery: 1.3, archerMax: 1, fireArrows: false,
        powers: 'W3SF', powerBlocks: 6, life: false,
        ballistas: [[2, 0], [11, 0]],
        sky: 'peaks',
    },
    {
        name: 'THE NIGHT SIEGE',
        hint: 'FIRE ARROWS BURN  THE FLAMES BAR YOUR WAY',
        layout: [
            '..............',
            's.s.s....s.s.s',
            'tss.st..ts.sst',
            'sss.smmmms.sss',
            'sssssmggmsssss',
            'stssssggssssts',
        ],
        banner: [6, 7],
        regions: [['TOWER', 0, 2], ['KEEP', 4, 9], ['TOWER', 11, 13]],
        speed: 1.03, archerEvery: 1.35, archerMax: 1, fireArrows: true,
        powers: 'W3FS', powerBlocks: 6, life: true,
        night: true,
        sky: 'night',
    },
    {
        name: 'THE WIZARD\'S TOWER',
        hint: 'STRIKE THE SORCERER  HE MENDS HIS WALLS',
        layout: [
            '.....r..r.....',
            '.....rrrr.....',
            '..s..rIIr..s..',
            '.sss.rmmr.sss.',
            'ssssssrrssssss',
            'sssss.gg.sssss',
        ],
        banner: [6, 7],
        regions: [['TOWER', 5, 8]],
        speed: 1.06, archerEvery: 1.4, archerMax: 1, fireArrows: false,
        powers: 'W3FS', powerBlocks: 6, life: false,
        sorcerer: true,
        sky: 'aurora',
    },
    {
        name: 'THE BLACK CITADEL',
        hint: 'HIT THE FURNACE WHEN ITS DOOR IS OPEN',
        layout: [
            'I.I........I.I',
            'III........III',
            'ImI........ImI',
            'sss........sss',
            'sss........sss',
            'sss........sss',
        ],
        banner: null,
        regions: [['TOWER', 0, 2], ['TOWER', 11, 13]],
        speed: 1.06, archerEvery: 1.1, archerMax: 2, fireArrows: false,
        powers: '3WF', powerBlocks: 4, life: false,
        boss: true,
        sky: 'ember',
    },
]);

// where the six stand on THE MARCH (the map between castles): x, y in screen px, along the road
export const MapSpots = Object.freeze([[42, 186], [92, 150], [146, 178], [196, 128], [242, 160], [282, 96]]);
