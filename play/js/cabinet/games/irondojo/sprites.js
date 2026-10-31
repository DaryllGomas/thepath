// THE NODE · world 1 · IRON DOJO (Ironclad Amusements, 1985) · THE SPRITES (data only).
// The first floor's cast is the port of the IronDojoSprites class at the bottom of IronDojoRenderer.cs
// (Staging/Batch3/irondojo), converted from the C# source by script, character for character. The floors above it
// (2026-10-18) add the pots and what is in them, the mirror ghosts, the blades, and four more masters: the ring dancer
// (the thrower's cut in violet), the giant (drawn fresh, blitted at x3), twin blades (the hero's own cut in navy) and
// the iron master (the stick master's robe in white, his hair gone white).
// Split into its own module so spec.js (the title art) and renderer.js both read it with no import cycle.
//
// Authored facing RIGHT as palette-index rows (see IronDojoPalette in spec.js):
//   0 shadow  1 shadowRed  2 dojoRed  3 red  4 woodDark  5 tanDark  6 tan  7 white  8 grey
//   9 goldDark  a gold  b night  c navy  d steel  e moon  f bambooDark  g bamboo  h jade  i plum  j violet  k orange
//   ('.' = transparent)
// ax = the body's centre column: the sprite stands on that column at the character's x.
import { PixelSprite } from '../../sdk/index.js';

export class Pose {
    constructor(s, ax) { this.s = s; this.ax = ax; }        // C# Pose(PixelSprite s, int ax)
    static rows(ax, ...rows) { return new Pose(PixelSprite.fromRows(...rows), ax); }   // C# Pose(int ax, params string[] rows)
}

// a pose in other clothes: map = { fromIndex: toIndex (-1 = clear) }, on rows y0..y1 only
function recolor(p, map, y0 = 0, y1 = 999) {
    const s = p.s, r = new PixelSprite(s.width, s.height);
    for (let y = 0; y < s.height; y++)
        for (let x = 0; x < s.width; x++) {
            const v = s.at(x, y);
            r.set(x, y, y >= y0 && y <= y1 && v >= 0 && map[v] !== undefined ? map[v] : v);
        }
    return new Pose(r, p.ax);
}

function chain(p, ...steps) { for (const [map, y0, y1] of steps) p = recolor(p, map, y0, y1); return p; }

// quarter turns clockwise (square sprites)
function rotate(src, quarters) {
    let cur = src;
    for (let q = 0; q < quarters; q++) {
        const n = cur.width;
        const r = new PixelSprite(n, n);
        for (let y = 0; y < n; y++)
            for (let x = 0; x < n; x++)
                r.set(n - 1 - y, x, cur.at(x, y));
        cur = r;
    }
    return cur;
}

function stamp(dst, src, ox, oy, flip) {
    for (let y = 0; y < src.height; y++)
        for (let x = 0; x < src.width; x++) {
            const v = src.at(flip ? src.width - 1 - x : x, y);
            if (v >= 0) dst.set(ox + x, oy + y, v);
        }
}

function lantern(s, x) {
    s.set(x + 2, 4, 5);
    for (let i = 1; i < 4; i++) s.set(x + i, 5, 10);
    for (let y = 6; y < 10; y++) for (let i = 0; i < 5; i++) s.set(x + i, y, (y === 8 && i > 0 && i < 4) ? 2 : 3);
    for (let i = 1; i < 4; i++) s.set(x + i, 10, 10);
    s.set(x + 2, 11, 3);
}

// ---- the fighter: black hair, red headband, white gi, black belt and slippers
const FighterStand = Pose.rows(8,
    ".......0000.....",
    ".....3333333....",
    "....3..06666....",
    ".......06606....",
    "........666.....",
    "......7777...66.",
    ".....777777777..",
    ".....7778777....",
    ".....7787777....",
    ".....0000000....",
    ".....7777777....",
    "....777...777...",
    "...777.....777..",
    "...77.......77..",
    "..777.......777.",
    "..000.......000.");

const FighterWalk1 = Pose.rows(8,
    ".......0000.....",
    ".....3333333....",
    "....3..06666....",
    ".......06606....",
    "........666.....",
    "......7777...66.",
    ".....777777777..",
    ".....7778777....",
    ".....7787777....",
    ".....0000000....",
    ".....7777777....",
    ".....777.777....",
    "....777...777...",
    "....77.....77...",
    "...777.....777..",
    "...000.....000..");

const FighterWalk2 = Pose.rows(8,
    ".......0000.....",
    ".....3333333....",
    "....3..06666....",
    ".......06606....",
    "........666.....",
    "......7777...66.",
    ".....777777777..",
    ".....7778777....",
    ".....7787777....",
    ".....0000000....",
    ".....7777777....",
    "......77777.....",
    "......7777......",
    "......777.......",
    ".....7777.......",
    ".....00000......");

const FighterPunch = Pose.rows(8,
    ".......0000.........",
    ".....3333333........",
    "....3..06666........",
    ".......06606........",
    "........666.........",
    "......7777..........",
    ".....77777777777766.",
    ".....7778777....66..",
    ".....7787777........",
    ".....0000000........",
    ".....7777777........",
    "....777...777.......",
    "...777.....777......",
    "...77.......77......",
    "..777.......777.....",
    "..000.......000.....");

const FighterChamber = Pose.rows(8,
    ".......0000.....",
    ".....3333333....",
    "....3..06666....",
    ".......06606....",
    "........666.....",
    "......7777..66..",
    ".....77777777...",
    ".....7778777....",
    ".....7787777....",
    ".....000000077..",
    ".....777777777..",
    ".....777...77...",
    "....777....00...",
    "....777.........",
    "...7777.........",
    "...0000.........");

const FighterKick = Pose.rows(7,
    "......0000............",
    "....3333333...........",
    "...3..06666...........",
    "......06606...........",
    ".......666............",
    "......7777............",
    ".....77777777.........",
    ".....7778777..........",
    ".....7787777..........",
    ".....0000000777777700.",
    ".....777777777777777000",
    ".....777..............",
    "....777...............",
    "....777...............",
    "...7777...............",
    "...0000...............");

const FighterDuck = Pose.rows(8,
    ".......0000.....",
    ".....3333333....",
    "....3..06666....",
    ".......06606....",
    "......77666..66.",
    ".....777777777..",
    ".....7778777....",
    "....00000000....",
    "...77777777777..",
    "...777.....777..",
    "..0000....0000..");

const FighterDuckPunch = Pose.rows(8,
    ".......0000.........",
    ".....3333333........",
    "....3..06666........",
    ".......06606........",
    "......77666.........",
    ".....77777777777766.",
    ".....7778777....66..",
    "....00000000........",
    "...77777777777......",
    "...777.....777......",
    "..0000....0000......");

const FighterDuckKick = Pose.rows(8,
    ".......0000...........",
    ".....3333333..........",
    "....3..06666..........",
    ".......06606..........",
    "......77666...........",
    ".....77777777.........",
    ".....7778777..........",
    "....00000000..........",
    "...7777777777777777700",
    "...777...777777777700.",
    "..0000................");

const FighterJump = Pose.rows(8,
    ".......0000.....",
    ".....3333333....",
    "....3..06666....",
    ".......06606....",
    "........666.....",
    "......7777..66..",
    ".....77777777...",
    ".....7778777....",
    ".....7787777....",
    ".....0000000....",
    ".....777777777..",
    "....7777777777..",
    "....777...777...",
    "...000....000...");

const FighterJumpKick = Pose.rows(7,
    "......0000............",
    "....3333333...........",
    "...3..06666...........",
    "......06606...........",
    ".......666............",
    "......7777............",
    ".....77777777.........",
    ".....7778777..........",
    ".....7787777..........",
    ".....0000000777777700.",
    ".....777777777777777000",
    "....77777.............",
    "...777.77.............",
    "...000.00.............");

const FighterFlinch = Pose.rows(9,
    "......0000......",
    "....3333333.....",
    "...3..06666.....",
    "......06606.....",
    ".......666......",
    "..66..7777..66..",
    "...77777777777..",
    "......78777.....",
    "......87777.....",
    "......0000000...",
    "......7777777...",
    ".....777...777..",
    ".....77.....77..",
    ".....77.....77..",
    "....777.....777.",
    "....000.....000.");

const FighterStruggle1 = Pose.rows(8,
    "......0000......",
    "....3333333.....",
    "...3..06666.....",
    "......06606.....",
    ".......666......",
    "....667777766...",
    ".....7777777....",
    ".....7778777....",
    ".....7787777....",
    ".....0000000....",
    ".....7777777....",
    ".....777.777....",
    "....777...777...",
    "....77.....77...",
    "...777.....777..",
    "...000.....000..");

const FighterStruggle2 = Pose.rows(8,
    "........0000....",
    "......3333333...",
    ".....3..06666...",
    "........06606...",
    ".........666....",
    "....667777766...",
    ".....7777777....",
    ".....7778777....",
    ".....7787777....",
    ".....0000000....",
    ".....7777777....",
    ".....777.777....",
    "....777...777...",
    "....77.....77...",
    "...777.....777..",
    "...000.....000..");

const FighterDown = Pose.rows(11,
    "...333..................",
    ".00003.....66...........",
    "0066663777777777777700..",
    "006606377700007777777000",
    ".06663.7777777777777700.",
    "..........66............");

// ---- the grabber: shaved head, black gi, red sash, arms out for the hug
const GrabberWalk1 = Pose.rows(7,
    "......666.......",
    ".....66666......",
    ".....66606......",
    ".....66666......",
    "......666.......",
    ".....00000......",
    "....0000000066..",
    "....0080000066..",
    "....000000......",
    "....333333......",
    "....000000......",
    "....00..00......",
    "...00....00.....",
    "...00....00.....",
    "..000....000....",
    "..444....444....");

const GrabberWalk2 = Pose.rows(7,
    "......666.......",
    ".....66666......",
    ".....66606......",
    ".....66666......",
    "......666.......",
    ".....00000......",
    "....0000000066..",
    "....0080000066..",
    "....000000......",
    "....333333......",
    "....000000......",
    ".....0000.......",
    ".....000........",
    ".....000........",
    "....0000........",
    "....4444........");

const GrabberHold = Pose.rows(7,
    ".......666......",
    "......66666.....",
    "......66606.....",
    "......66666.....",
    ".......666......",
    ".....000000.....",
    "....00000000000.",
    "....008000000066",
    "....0000000000..",
    "....333333..66..",
    "....000000......",
    "....00..00......",
    "...00....00.....",
    "...00....00.....",
    "..000....000....",
    "..444....444....");

const GrabberHit = Pose.rows(8,
    ".66.............",
    ".66.......666...",
    "..00.....66666..",
    "...00....60666..",
    "....00...66666..",
    ".....00000666...",
    ".....000000.....",
    ".....008000.....",
    ".....000000.....",
    ".....333333.....",
    ".....000000.....",
    ".....00..00.....",
    "....00....00....",
    "...00......00...",
    "..000......000..",
    "..444......444..");

// ---- the knife thrower: topknot, red vest, bare arms, black trousers
const ThrowerStand = Pose.rows(7,
    "......00........",
    ".....00000......",
    ".....06666......",
    ".....06606......",
    "......666.......",
    ".....33333......",
    "....6333336.....",
    "....6338336.....",
    "....6333336.....",
    ".....00000......",
    ".....00000......",
    ".....00.00......",
    "....00...00.....",
    "....00...00.....",
    "...000...000....",
    "...444...444....");

const ThrowerWalk1 = ThrowerStand;

const ThrowerWalk2 = Pose.rows(7,
    "......00........",
    ".....00000......",
    ".....06666......",
    ".....06606......",
    "......666.......",
    ".....33333......",
    "....6333336.....",
    "....6338336.....",
    "....6333336.....",
    ".....00000......",
    ".....00000......",
    "......000.......",
    "......000.......",
    "......000.......",
    ".....0000.......",
    ".....4444.......");

// wind-up HIGH: the knife cocked above the head (duck!)
const ThrowerHigh = Pose.rows(7,
    "......00...7777.",
    ".....00000.6....",
    ".....06666.6....",
    ".....06606.6....",
    "......666..6....",
    ".....333336.....",
    "....633333......",
    "....6338333.....",
    "....633333......",
    ".....00000......",
    ".....00000......",
    ".....00.00......",
    "....00...00.....",
    "....00...00.....",
    "...000...000....",
    "...444...444....");

// wind-up LOW: the knife drawn back at the hip, blade low (jump!)
const ThrowerLow = Pose.rows(7,
    "......00........",
    ".....00000......",
    ".....06666......",
    ".....06606......",
    "......666.......",
    ".....33333......",
    "....6333333.....",
    "....6338333.....",
    "....633333.6....",
    ".....00000..6...",
    ".....00000...6..",
    ".....00.00...7777",
    "....00...00.....",
    "....00...00.....",
    "...000...000....",
    "...444...444....");

const ThrowerHit = Pose.rows(8,
    ".6..............",
    ".6........00....",
    "..6......00000..",
    "...6.....60666..",
    "....6....66666..",
    ".....6333336....",
    ".....333333.6...",
    ".....333833..6..",
    ".....333333.....",
    ".....000000.....",
    ".....000000.....",
    ".....00..00.....",
    "....00....00....",
    "...00......00...",
    "..000......000..",
    "..444......444..");

// ---- the tumbling dwarf: a grey ball with a red cap; four quarter turns of a somersault
const DwarfBase = PixelSprite.fromRows(
    "...333...",
    "..33333..",
    ".8866068.",
    ".8866668.",
    ".8888888.",
    ".8888888.",
    ".8808088.",
    "..88888..",
    "...888...");
const DwarfRoll = [new Pose(DwarfBase, 4), new Pose(rotate(DwarfBase, 1), 4), new Pose(rotate(DwarfBase, 2), 4), new Pose(rotate(DwarfBase, 3), 4)];
const DwarfHop = Pose.rows(4,
    "...333...",
    "..33333..",
    "..66066..",
    "..66666..",
    ".6888886.",
    "..88888..",
    "..88888..",
    "..8...8..",
    ".00...00.");

// ---- the boss: the stick master. Gold robe, black topknot and beard
const BossStand = Pose.rows(8,
    ".......00.........",
    "......0000........",
    "......06666.......",
    "......06606.......",
    "......00666.......",
    ".......000........",
    ".....aaaaaaa......",
    "....aaaaaaaaa.....",
    "....aa9aaaaaa666..",
    "....aaa9aaaa......",
    "....000000000.....",
    "....aaaaaaaaa.....",
    "....aaa9aaaaa.....",
    "...aaaa9aaaaaa....",
    "...aaa99aaaaaa....",
    "..aaaaa9aaaaaaa...",
    "..aaaaa9aaaaaaa...",
    "...000.....000....");

const BossStep = Pose.rows(8,
    ".......00.........",
    "......0000........",
    "......06666.......",
    "......06606.......",
    "......00666.......",
    ".......000........",
    ".....aaaaaaa......",
    "....aaaaaaaaa.....",
    "....aa9aaaaaa666..",
    "....aaa9aaaa......",
    "....000000000.....",
    "....aaaaaaaaa.....",
    "....aaa9aaaaa.....",
    "....aaa9aaaaa.....",
    "....aa99aaaaa.....",
    "...aaaa9aaaaaa....",
    "...aaaa9aaaaaa....",
    "....000...000.....");

const BossRaise = Pose.rows(8,
    ".......00.........",
    "......0000..66....",
    "......06666.a6....",
    "......06606.aa....",
    "......00666aaa....",
    ".......000aaa.....",
    ".....aaaaaaaa.....",
    "....aaaaaaaaa.....",
    "....aa9aaaaaa.....",
    "....aaa9aaaa......",
    "....000000000.....",
    "....aaaaaaaaa.....",
    "....aaa9aaaaa.....",
    "...aaaa9aaaaaa....",
    "...aaa99aaaaaa....",
    "..aaaaa9aaaaaaa...",
    "..aaaaa9aaaaaaa...",
    "...000.....000....");

const BossStrike = Pose.rows(8,
    "........00........",
    ".......0000.......",
    ".......06666......",
    ".......06606......",
    ".......00666......",
    "........000.......",
    "......aaaaaaa.....",
    ".....aaaaaaaaaaa66",
    ".....aa9aaaaaaa66.",
    ".....aaa9aaaa.....",
    ".....000000000....",
    ".....aaaaaaaaa....",
    ".....aaa9aaaaa....",
    "....aaaa9aaaaaa...",
    "...aaaa99aaaaaaa..",
    "..aaaaaa9aaaaaaaa.",
    ".aaaaaaa9aaaaaaaa.",
    "..000.........000.");

const BossHurt = Pose.rows(9,
    "......00..........",
    ".....0000.........",
    ".....06666........",
    ".....06006........",
    ".....00666........",
    "......000.........",
    "....aaaaaaa.......",
    "...aaaaaaaaa......",
    "..66aa9aaaaaa.....",
    "...aaaa9aaaa......",
    "....000000000.....",
    "....aaaaaaaaa.....",
    "....aaa9aaaaa.....",
    "...aaaa9aaaaaa....",
    "...aaa99aaaaaa....",
    "..aaaaa9aaaaaaa...",
    "..aaaaa9aaaaaaa...",
    "...000.....000....");

const BossDown = Pose.rows(14,
    "..................00........",
    "..................000.......",
    ".000aaaaaaaaaaaaaa6660......",
    "000aaa9aaa0aaaaaaa6600......",
    ".00aaaa99a0aaaaaaa666.......",
    "...aaaaaaa0aaaaaaaa.........");

// ---- props
const Knife = Pose.rows(3,
    "447777..",
    "44777777");

const LifeHead = PixelSprite.fromRows(
    "..0000.",
    "3333333",
    ".06666.",
    ".06606.",
    "..666..");

// ---- the lantern hall: a clay pot on a rope (tanDark, a red band), and the bowl of tea a broken one may leave
const Pot = Pose.rows(3,
    "..4444..",
    "...55...",
    "..5555..",
    ".556655.",
    ".533335.",
    ".556655.",
    ".555555.",
    "..5555..",
    "...44...");

const Tea = Pose.rows(3,
    "7777777",
    ".7aaa7.",
    "..777..");

// the snake: a wave of bamboo green, darker beneath, a head with an eye and a red tongue. Two frames of a slither.
function snakeFrame(ph) {
    const W = [3, 2, 2, 3, 4, 4, 3, 2, 2, 3];
    const s = new PixelSprite(14, 6);
    for (let c = 0; c < 10; c++) {
        const y = W[(c + ph * 2) % 10];
        s.set(c, y, 16); s.set(c, y + 1, 15);
    }
    s.set(0, W[(ph * 2) % 10], 15);
    const hy = W[(9 + ph * 2) % 10] - 1;
    s.set(10, hy, 16); s.set(11, hy, 16); s.set(12, hy, 16); s.set(10, hy + 1, 16); s.set(11, hy + 1, 17); s.set(12, hy + 1, 17);
    s.set(11, hy, 0); s.set(13, hy + 1, 3);
    return new Pose(s, 6);
}
const SnakeA = snakeFrame(0), SnakeB = snakeFrame(1);

// the fire-lizard: orange, a gold head, red wings up then down
const LizardA = Pose.rows(5,
    "....3.......",
    "...333......",
    "..3333......",
    "k.kkkkkkaaa.",
    ".kkkkkkka0aa",
    "...a...a....");
const LizardB = Pose.rows(5,
    "............",
    "............",
    "............",
    "k.kkkkkkaaa.",
    ".kkkkkkka0aa",
    "..3333.a....",
    "...333......");

// the flying blade, a quarter turn apart
const BladeA = Pose.rows(3,
    "...e...",
    "...d...",
    "..ddd..",
    "edd0dde",
    "..ddd..",
    "...d...",
    "...e...");
const BladeB = Pose.rows(3,
    "e.....e",
    ".d...d.",
    "..ddd..",
    "..d0d..",
    "..ddd..",
    ".d...d.",
    "e.....e");

// ---- the mirror ghost: the hero's own cut in moonlight (white > moon, folds and band > steel, hair and belt > navy)
const GhostMap = { 7: 14, 8: 13, 3: 13, 6: 14, 0: 12 };
const GhostStand = recolor(FighterStand, GhostMap);
const GhostWalk1 = recolor(FighterWalk1, GhostMap);
const GhostWalk2 = recolor(FighterWalk2, GhostMap);
const GhostWindup = recolor(FighterChamber, GhostMap);
const GhostStrike = recolor(FighterPunch, GhostMap);

// ---- THE RING DANCER: the thrower's cut, a violet robe with a gold clasp, plum trousers. His ring is drawn by the
// renderer (in his hand, or flying), so the thrower's knife is cleared from the poses.
const RingMap = [[{ 3: 19, 8: 10, 7: -1 }, 0, 99], [{ 0: 18 }, 9, 15]];
const RingStand = chain(ThrowerStand, ...RingMap);
const RingStep = chain(ThrowerWalk2, ...RingMap);
const RingHigh = chain(ThrowerHigh, ...RingMap);
const RingLow = chain(ThrowerLow, ...RingMap);
const RingHurt = chain(ThrowerHit, ...RingMap);
const RingDown = recolor(FighterDown, { 7: 19, 3: 18 });

// ---- TWIN BLADES: the hero's own cut in navy (folds night), a red headband. His two blades are drawn by the renderer.
const TwinMap = { 7: 12, 8: 11 };
const TwinStand = recolor(FighterStand, TwinMap);
const TwinStep = recolor(FighterWalk1, TwinMap);
const TwinRaise = recolor(FighterChamber, TwinMap);
const TwinSlash = recolor(FighterPunch, TwinMap);
const TwinHurt = recolor(FighterFlinch, TwinMap);
const TwinDown = recolor(FighterDown, TwinMap);

// ---- THE IRON MASTER: the stick master's robe in white (folds grey), a red sash, his topknot and beard gone white
const MasterMap = [[{ 10: 7, 9: 8 }, 0, 99], [{ 0: 14 }, 0, 5], [{ 0: 3 }, 10, 10]];
const MasterStand = chain(BossStand, ...MasterMap);
const MasterStep = chain(BossStep, ...MasterMap);
const MasterRaise = chain(BossRaise, ...MasterMap);
const MasterStrike = chain(BossStrike, ...MasterMap);
const MasterHurt = chain(BossHurt, ...MasterMap);
const MasterDown = recolor(BossDown, { 10: 7, 9: 8 });

// ---- THE GIANT (blitted at x3, 48 x 54 px): a topknot, a great belly, a red belt with a gold knot
const GiantStand = Pose.rows(8,
    ".......00.......",
    "......0000......",
    ".....066660.....",
    ".....666066.....",
    ".....666666.....",
    "......5665......",
    "...5666666665...",
    "..566666666666..",
    "..665666666566..",
    "..66.66666666.66",
    "..66.66666666.66",
    ".666.22222222666",
    "....2222a2222...",
    "....666.2.666...",
    "....666...666...",
    "...6666...6666..",
    "...666.....666..",
    "...555.....555..");

const GiantStep = Pose.rows(8,
    ".......00.......",
    "......0000......",
    ".....066660.....",
    ".....666066.....",
    ".....666666.....",
    "......5665......",
    "...5666666665...",
    "..566666666666..",
    "..665666666566..",
    "..66.66666666.66",
    "..66.66666666.66",
    ".666.22222222666",
    "....2222a2222...",
    ".....666.666....",
    ".....666.666....",
    "....6666.666....",
    "....666..6666...",
    "....555..555....");

// the SLAM tell: both fists overhead
const GiantRaise = Pose.rows(8,
    "..66........66..",
    "..66...00...66..",
    "..66..0000..66..",
    "..66.066660.66..",
    "...6.666066.6...",
    "...6.666666.6...",
    "...66.5665.66...",
    "....66666666....",
    "...5666666665...",
    "..566666666666..",
    "..66666666666...",
    "....22222222....",
    "....2222a2222...",
    "....666.2.666...",
    "....666...666...",
    "...6666...6666..",
    "...666.....666..",
    "...555.....555..");

// the SLAM: down on one knee, both fists on the boards
const GiantSlam = Pose.rows(8,
    "................",
    "................",
    "................",
    ".......00.......",
    "......0000......",
    ".....066660.....",
    ".....666066.....",
    ".....666666.....",
    "...56665665.....",
    "..56666666665...",
    "..666666666666..",
    "..66666666666.66",
    "..6622222222a.66",
    ".66.2222a222..66",
    ".66..666..666.66",
    "666..666...6666.",
    "666.6666...666..",
    "....555....555..");

// the SWAT tell: the front arm drawn back behind his head
const GiantDraw = Pose.rows(8,
    "...66...........",
    "...666.00.......",
    "....6600000.....",
    ".....066660.....",
    ".....666066.....",
    ".....666666.....",
    "......5665......",
    "...5666666665...",
    "..566666666666..",
    "..665666666566..",
    "..66.666666666..",
    ".666.22222222...",
    "....2222a2222...",
    "....666.2.666...",
    "....666...666...",
    "...6666...6666..",
    "...666.....666..",
    "...555.....555..");

// the SWAT: the arm swept out level (it reaches past his body)
const GiantSwat = Pose.rows(8,
    ".......00...........",
    "......0000..........",
    ".....066660.........",
    ".....666066.........",
    ".....666666.........",
    "......5665..........",
    "...5666666665.......",
    "..56666666666666666.",
    "..66566666666666666.",
    "..66.666666666...66.",
    "..66.66666666.......",
    ".666.22222222.......",
    "....2222a2222.......",
    "....666.2.666.......",
    "....666...666.......",
    "...6666...6666......",
    "...666.....666......",
    "...555.....555......");

const GiantHurt = Pose.rows(9,
    "......00........",
    ".....0000.......",
    "....066660......",
    "....660606......",
    "....666666......",
    ".....5665.......",
    "..5666666665....",
    ".566666666666...",
    ".665666666566...",
    "66..66666666.66.",
    "66..66666666..66",
    "....22222222....",
    "....2222a2222...",
    "....666.2.666...",
    "....666...666...",
    "...6666...6666..",
    "...666.....666..",
    "...555.....555..");

const GiantDown = Pose.rows(13,
    "..........666666..........",
    "....55...66666666.........",
    ".00666..6666666666..2.....",
    "0066066.66666666662a2.6655",
    "0066666666666666662226666.",
    ".066666.666666666622.6655.");

// the title card: a flying kick meets a grabber under the pagoda's eave
function buildTitleArt() {
    const W = 136, H = 23;
    const s = new PixelSprite(W, H);
    // the eave: gold ridge with upturned tips, red tiles, dark underside, gold rafter ends
    for (let x = 0; x < W; x++) { s.set(x, 0, 10); s.set(x, 1, 2); s.set(x, 2, 2); s.set(x, 3, 1); }
    for (let x = 3; x < W - 3; x += 6) s.set(x, 3, 9);
    s.set(0, 0, -1); s.set(W - 1, 0, -1);
    for (let k = 0; k < 3; k++) { s.set(k, 1 - Math.min(1, k), 10); s.set(W - 1 - k, 1 - Math.min(1, k), 10); }
    lantern(s, 10); lantern(s, 92);
    // the floor line
    for (let x = 0; x < W; x++) s.set(x, H - 1, 5);
    // the fight: a flying kick lands on a grabber, a dwarf tumbles in, the stick master waits
    stamp(s, FighterJumpKick.s, 18, 5, false);
    stamp(s, GrabberHit.s, 40, 6, true);
    stamp(s, DwarfRoll[1].s, 66, 13, true);
    stamp(s, BossRaise.s, 104, 4, true);
    for (let k = 0; k <= 9; k++) { s.set(120 - (k >> 1) + 5, 14 - k, 4); s.set(121 - (k >> 1) + 5, 14 - k, 4); }   // the stick, raised
    s.set(121, 5, 10); s.set(122, 5, 10);
    // the impact
    s.set(39, 12, 7); s.set(38, 11, 10); s.set(38, 13, 10); s.set(40, 11, 10); s.set(40, 13, 10); s.set(37, 12, 10);
    return s;
}

const TitleArt = buildTitleArt();

export const IronDojoSprites = Object.freeze({
    FighterStand, FighterWalk1, FighterWalk2, FighterPunch, FighterChamber, FighterKick, FighterDuck, FighterDuckPunch, FighterDuckKick, FighterJump, FighterJumpKick, FighterFlinch, FighterStruggle1, FighterStruggle2, FighterDown, GrabberWalk1, GrabberWalk2, GrabberHold, GrabberHit, ThrowerStand, ThrowerWalk1, ThrowerWalk2, ThrowerHigh, ThrowerLow, ThrowerHit, DwarfRoll, DwarfHop, BossStand, BossStep, BossRaise, BossStrike, BossHurt, BossDown, Knife, LifeHead, TitleArt,
    Pot, Tea, SnakeA, SnakeB, LizardA, LizardB, BladeA, BladeB,
    GhostStand, GhostWalk1, GhostWalk2, GhostWindup, GhostStrike,
    RingStand, RingStep, RingHigh, RingLow, RingHurt, RingDown,
    TwinStand, TwinStep, TwinRaise, TwinSlash, TwinHurt, TwinDown,
    MasterStand, MasterStep, MasterRaise, MasterStrike, MasterHurt, MasterDown,
    GiantStand, GiantStep, GiantRaise, GiantSlam, GiantDraw, GiantSwat, GiantHurt, GiantDown,
});
