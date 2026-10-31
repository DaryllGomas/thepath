// THE NODE · world 1 · IRONWORKS on the Cabinet Engine · THE SPRITE SHEET.
// Port of the IronworksSprites class at the bottom of IronworksRenderer.cs. Split out so spec.js
// can take the title art without importing the renderer (no ES import cycle).
//
// indices: 0 bg 1 red 2 redDark 3 steel 4 steelDark 5 drum 6 gold 7 goldDark 8 blue 9 cyan
//          a white b skin c fire d blueDark e cyanDark f ember g green
// (2026-10-18: the build-out's new pieces: ore carts, hot drums, spring jacks, the three pickups, a
// cheering climber, the foreman upside down, and the furnace.)
import { PixelSprite, roundEven } from '../../sdk/index.js';

// ------------------------------------------------------------------ builders
function mirror(src) {
    const s = new PixelSprite(src.width, src.height);
    for (let j = 0; j < src.height; j++)
        for (let i = 0; i < src.width; i++) { const v = src.at(i, j); if (v >= 0) s.set(src.width - 1 - i, j, v); }
    return s;
}

// quarter turns clockwise
function rotate(src, quarters) {
    quarters &= 3;
    if (quarters === 0) return src;
    const w = src.width, h = src.height;
    const s = quarters === 2 ? new PixelSprite(w, h) : new PixelSprite(h, w);
    for (let j = 0; j < h; j++)
        for (let i = 0; i < w; i++) {
            const v = src.at(i, j);
            if (v < 0) continue;
            if (quarters === 1) s.set(h - 1 - j, i, v);
            else if (quarters === 2) s.set(w - 1 - i, h - 1 - j, v);
            else s.set(j, w - 1 - i, v);
        }
    return s;
}

function stamp(dst, src, x, y) {
    for (let j = 0; j < src.height; j++)
        for (let i = 0; i < src.width; i++) {
            const v = src.at(i, j);
            if (v >= 0) dst.set(x + i, y + j, v);
        }
}

// a steel drum's lid, end-on: a steel rim, a black lid with a dark rolled ring, and the
// bung on the ring turning 45 degrees a frame; a fixed glint top left
// (map: a HOT drum swaps the steel for fire and ember: { 3: 12, 4: 15, 5: 2, 10: 6 })
function drumFrame(k, map) {
    const m = v => (map && map[v] !== undefined ? map[v] : v);
    const s = new PixelSprite(12, 12);
    for (let j = 0; j < 12; j++)
        for (let i = 0; i < 12; i++) {
            const dx = i - 5.5, dy = j - 5.5, d = Math.sqrt(dx * dx + dy * dy);
            if (d > 6.1) continue;
            let v = d > 5.0 ? 3 : d > 4.2 ? 4 : 5;
            if (v === 5 && d > 2.6 && d < 3.5) v = 4;
            s.set(i, j, m(v));
        }
    const a = k * Math.PI / 4.0;
    const bx = roundEven(5.5 + Math.cos(a) * 3.0 - 0.5), by = roundEven(5.5 + Math.sin(a) * 3.0 - 0.5);
    s.set(bx, by, m(3)); s.set(bx + 1, by, m(3)); s.set(bx, by + 1, m(3)); s.set(bx + 1, by + 1, m(3));
    s.set(3, 2, m(10)); s.set(2, 3, m(10)); s.set(4, 2, m(3));
    return s;
}

// the furnace (board 5): a brick stack with a steel rim and an arched mouth; the fire in it flickers
function buildFurnace(k) {
    const s = new PixelSprite(24, 22);
    for (let j = 0; j < 22; j++)
        for (let i = 0; i < 24; i++) {
            let v;
            if (i === 0 || i === 23 || j === 0) v = 4;
            else if (j <= 2) v = 3;
            else if ((j - 3) % 4 === 3) v = 2;
            else if ((i + (Math.trunc((j - 3) / 4) & 1) * 4) % 8 === 0) v = 2;
            else v = 1;
            s.set(i, j, v);
        }
    for (let j = 11; j < 22; j++)
        for (let i = 7; i <= 16; i++) {
            if (j === 11 && (i === 7 || i === 16)) continue;
            const inner = i >= 9 && i <= 14 && j >= 13;
            let v = inner ? 6 : 12;
            if (inner && j >= 17 && ((i + j + k) & 1) === 0) v = 10;
            if (!inner && ((i * 3 + j + k * 2) % 5) === 0) v = 15;
            s.set(i, j, v);
        }
    return s;
}

function buildOilDrum() {
    const s = new PixelSprite(16, 18);
    for (let j = 0; j < 18; j++)
        for (let i = 0; i < 16; i++) {
            let v = 3;
            if (i === 0 || i === 15 || j === 0 || j === 17) v = 4;
            else if (j === 4 || j === 12) v = 1;
            else if (j === 5 || j === 13) v = 2;
            else if (i === 3) v = 10;
            else if (i >= 12) v = 4;
            s.set(i, j, v);
        }
    // O I L on the middle band, in drum black
    const oil = ['###.#.#..', '#.#.#.#..', '#.#.#.#..', '#.#.#.#..', '###.#.###'];
    for (let j = 0; j < 5; j++)
        for (let i = 0; i < oil[j].length; i++)
            if (oil[j][i] === '#') s.set(4 + i, 6 + j, 5);
    return s;
}

// ------------------------------------------------------------------ the climber, facing right, 12 x 16: gold hard hat, blue overalls, white shirt
const Stand = PixelSprite.fromRows(
    '....6666....',
    '...666666...',
    '..6666666666',
    '...bbbbbb...',
    '...bbbb5bb..',
    '...bbbbbbb..',
    '....bbbb....',
    '..aa8888aa..',
    '.aaa8888aaa.',
    '.bb888888bb.',
    '...888888...',
    '...88dd88...',
    '...888888...',
    '...88..88...',
    '..555..555..',
    '..555..555..');

const Walk1 = PixelSprite.fromRows(
    '....6666....',
    '...666666...',
    '..6666666666',
    '...bbbbbb...',
    '...bbbb5bb..',
    '...bbbbbbb..',
    '....bbbb....',
    '..aa8888aa..',
    '.aaa8888aaab',
    'bb.888888...',
    '...888888...',
    '...88dd88...',
    '...888888...',
    '..888..888..',
    '.555....555.',
    '.555....555.');

const Walk2 = PixelSprite.fromRows(
    '....6666....',
    '...666666...',
    '..6666666666',
    '...bbbbbb...',
    '...bbbb5bb..',
    '...bbbbbbb..',
    '....bbbb....',
    '..aa8888aa..',
    '..aa8888aa..',
    '..bb8888bb..',
    '...888888...',
    '...88dd88...',
    '...888888...',
    '....8888....',
    '....5555....',
    '...555555...');

// on a ladder, from behind; B is A mirrored
const ClimbA = PixelSprite.fromRows(
    '.b..6666....',
    '.a.666666...',
    '.a.666666...',
    '.aabbbbbb...',
    '..a8bbbb8...',
    '..888888888.',
    '..8888888aa.',
    '..888888..ab',
    '..888888....',
    '..88dd88....',
    '..888888....',
    '..88..88....',
    '..88..88....',
    '.555..88....',
    '.555..555...',
    '......555...');

const ClimbB = mirror(ClimbA);

const LifeIcon = PixelSprite.fromRows(
    '..666..',
    '.66666.',
    '..bbb..',
    '.88888.',
    '..888..',
    '.88.88.',
    '.5...5.');

// the hammer: over the head, and swung forward (facing right)
const HammerUp = PixelSprite.fromRows(
    '33333333',
    '34444443',
    '33333333',
    '...77...',
    '...77...',
    '...77...',
    '...77...',
    '...77...',
    '...66...');

const HammerFwd = PixelSprite.fromRows(
    '........333.',
    '........343.',
    '77777777343.',
    '77777777343.',
    '........343.',
    '........333.');

// a drum end-on, rolling: 8 frames, one turn per 38 px rolled
const DrumRoll = [];
for (let k = 0; k < 8; k++) DrumRoll.push(drumFrame(k));

// a drum standing (the foreman's stack, the one he heaves) and lying (going down a ladder)
const DrumUpright = PixelSprite.fromRows(
    '..33333333..',
    '.3444444443.',
    '.3555555553.',
    '.3545555553.',
    '.3333333333.',
    '.3555555553.',
    '.3545555553.',
    '.3333333333.',
    '.3555555553.',
    '.3545555553.',
    '.3444444443.',
    '..33333333..');

const DrumLying = rotate(DrumUpright, 1);

// a hot drum (board 5): it glows, and the furnace turns it into a fire-ball
const HotMap = { 3: 12, 4: 15, 5: 2, 10: 6 };
const HotRoll = [];
for (let k = 0; k < 8; k++) HotRoll.push(drumFrame(k, HotMap));

const FireA = PixelSprite.fromRows(
    '....c..c..',
    '...cc.cc..',
    '..cccccc..',
    '.cc6666cc.',
    '.c6a66a6c.',
    '.c656656c.',
    '.c666666c.',
    '.cc6666cc.',
    '..cccccc..',
    '...cccc...');

const FireB = PixelSprite.fromRows(
    '..c....c..',
    '..cc..cc..',
    '..cccccc..',
    '.cc6666cc.',
    '.c6a66a6c.',
    '.c656656c.',
    '.c666666c.',
    '.cc6666cc.',
    '..cccccc..',
    '...cccc...');

const OilDrum = buildOilDrum();

const FlameA = PixelSprite.fromRows(
    '..c......c......',
    '..cc....cc...c..',
    '.ccc...ccc..cc..',
    '.cc6c.cc6cc.ccc.',
    'cc66cccc66cccc6c',
    'c6666cc6666c666c',
    'c66666666666666c',
    'cc666666666666cc');

const FlameB = PixelSprite.fromRows(
    '......c.......c.',
    '..c..cc...c..cc.',
    '.cc..ccc..cc.cc.',
    '.ccc.c6cc.ccc6c.',
    'cc6ccc66cc66cc6c',
    'c666c6666c66666c',
    'c66666666666666c',
    'cc666666666666cc');

// the foreman, 24 x 24: white hard hat, moustache, hi-vis vest over a black shirt
const ForemanIdle = PixelSprite.fromRows(
    '........aaaaaaa.........',
    '.......aaaaaaaaa........',
    '......aaaaaaaaaaa.......',
    '.....aaaaaaaaaaaaa......',
    '........bbbbbbb.........',
    '.......bb5bbb5bb........',
    '.......bbbbbbbbb........',
    '.......bb55555bb........',
    '........bbbbbbb.........',
    '....ccc555555555ccc.....',
    '...cccc555555555cccc....',
    '..bbccc555555555cccbb...',
    '..bbccc555555555cccbb...',
    '..bb.cc555555555cc.bb...',
    '..bb.cc566666665cc.bb...',
    '..bb.cc555555555cc.bb...',
    '.bbb.cc555555555cc.bbb..',
    '.....4444444444444......',
    '.....444444.444444......',
    '.....44444...44444......',
    '.....44444...44444......',
    '.....44444...44444......',
    '....555555...555555.....',
    '....555555...555555.....');

const ForemanLift = PixelSprite.fromRows(
    '.....bb.aaaaaaa.bb......',
    '....cc.aaaaaaaaa.cc.....',
    '...cc.aaaaaaaaaaa.cc....',
    '..cc.aaaaaaaaaaaaa.cc...',
    '..cc....bbbbbbb....cc...',
    '..ccc..bb5bbb5bb..ccc...',
    '...cc..bbbbbbbbb..cc....',
    '...ccc.bb55555bb.ccc....',
    '....cc..bbbbbbb..cc.....',
    '....ccc555555555ccc.....',
    '....ccc555555555ccc.....',
    '.....cc555555555cc......',
    '.....cc555555555cc......',
    '.....cc555555555cc......',
    '.....cc566666665cc......',
    '.....cc555555555cc......',
    '.....cc555555555cc......',
    '.....4444444444444......',
    '.....444444.444444......',
    '.....44444...44444......',
    '.....44444...44444......',
    '.....44444...44444......',
    '....555555...555555.....',
    '....555555...555555.....');

// an ore cart (board 2): a steel tub heaped with ore on two wheels; the wheels turn (A, B)
const CartA = PixelSprite.fromRows(
    '...67..76...',
    '.6776676776.',
    '333333333333',
    '344444444443',
    '34a444444443',
    '344444444443',
    '.3333333333.',
    '.454....454.',
    '..5......5..');

const CartB = PixelSprite.fromRows(
    '...67..76...',
    '.6776676776.',
    '333333333333',
    '344444444443',
    '34a444444443',
    '344444444443',
    '.3333333333.',
    '.545....545.',
    '..4......4..');

// a spring jack (board 3): two plates and the coil; squashed for the frame it lands
const SpringUp = PixelSprite.fromRows(
    '.33333333.',
    '..444444..',
    '.aaaaaaa..',
    '..3333333.',
    '.aaaaaaa..',
    '..3333333.',
    '.aaaaaaa..',
    '..3333333.',
    '..444444..',
    '.33333333.');

const SpringSquash = PixelSprite.fromRows(
    '.33333333.',
    '.aaaaaaa..',
    '..3333333.',
    '.aaaaaaa..',
    '..444444..',
    '.33333333.');

// the pickups: a hard hat 300, a lunch pail 500, a toolbox 800
const HardHat = PixelSprite.fromRows(
    '...6666...',
    '..666666..',
    '.66a66666.',
    '.66666666.',
    '6666666666',
    '.77777777.');

const LunchPail = PixelSprite.fromRows(
    '...3333...',
    '..3....3..',
    '.88888888.',
    '8dddddddd8',
    '8888888888',
    '8a88888888',
    '8888888888',
    '.dddddddd.');

const Toolbox = PixelSprite.fromRows(
    '....3333....',
    '...3....3...',
    '111111111111',
    '1a1111111111',
    '222222222222',
    '111111111111',
    '.2222222222.');

// the climber with both arms up: topped out
const Cheer = PixelSprite.fromRows(
    '.b..6666..b.',
    '.a.666666.a.',
    '.a66666666a.',
    '..abbbbbba..',
    '...bbbb5b...',
    '...bbbbbb...',
    '....bbbb....',
    '...a8888a...',
    '...a8888a...',
    '...888888...',
    '...888888...',
    '...88dd88...',
    '...888888...',
    '...88..88...',
    '..555..555..',
    '..555..555..');

// a little star over the foreman's head once he has come down
const Star = PixelSprite.fromRows(
    '..6..',
    '..6..',
    '66a66',
    '..6..',
    '..6..');

// the title card's picture, at game scale: the foreman's stack, the foreman, a floating
// hammer, a drum rolling and the climber hopping the next one, the ladder up
function buildTitleArt() {
    const s = new PixelSprite(160, 36);
    // a girder along the bottom
    for (let x = 0; x < 160; x += 8) {
        for (let i = 0; i < 8; i++) { s.set(x + i, 29, 1); s.set(x + i, 34, 1); s.set(x + i, 35, 2); }
        for (let k = 0; k < 4; k++) { s.set(x + k, 30 + k, 1); s.set(x + 7 - k, 30 + k, 1); }
    }
    // the ladder up at the right
    for (let y = 0; y < 29; y++) { s.set(140, y, 9); s.set(147, y, 9); }
    for (let y = 26; y >= 0; y -= 4) for (let i = 141; i < 147; i++) s.set(i, y, 9);
    stamp(s, DrumUpright, 0, 5);
    stamp(s, DrumUpright, 0, 17);
    stamp(s, ForemanIdle, 13, 5);
    stamp(s, HammerUp, 70, 6);
    stamp(s, DrumRoll[1], 50, 17);
    stamp(s, DrumRoll[5], 104, 17);
    stamp(s, Walk1, 102, 0);
    return s;
}

export const IronworksSprites = Object.freeze({
    Stand, Walk1, Walk2, ClimbA, ClimbB,
    // the knock-down: the stand frame turned a quarter at a time
    ClimberTurn: [Stand, rotate(Stand, 1), rotate(Stand, 2), rotate(Stand, 3)],
    LifeIcon, HammerUp, HammerFwd, DrumRoll, DrumUpright, DrumLying, FireA, FireB,
    OilDrum, FlameA, FlameB, ForemanIdle, ForemanLift,
    HotRoll, CartA, CartB, SpringUp, SpringSquash, Pickups: [HardHat, LunchPail, Toolbox], Cheer, Star,
    ForemanDazed: rotate(ForemanIdle, 2),
    Furnace: [buildFurnace(0), buildFurnace(1)],
    TitleArt: buildTitleArt(),
});
