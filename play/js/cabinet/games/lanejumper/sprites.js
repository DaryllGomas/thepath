// THE NODE · world 1 · LANE JUMPER on the Cabinet Engine · THE SPRITES and the title card's picture.
// The static part of LaneJumperRenderer.cs (its static constructor, the sprite makers and BuildTitleArt),
// split out so spec.js (title art) and renderer.js can both read it without an import cycle.
//
// Palette indices (spec.js): 0 bg, 1 asphaltDark, 2 asphalt, 3 asphaltLight, 4 yellow, 5 amber, 6 teal,
// 7 tealDark, 8 tealLight, 9 white, a cream, b green, c greenDark, d brown, e brownDark, f red.
import { PixelSprite, Dir4 } from '../../sdk/index.js';

export function idx(c) { const k = c.charCodeAt(0); return k >= 48 && k <= 57 ? k - 48 : 10 + k - 97; }

function fill(s, x, y, w, h, c) {
    const v = idx(c);
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) s.set(i, j, v);
}

function box(s, x, y, w, h, f) {
    fill(s, x, y, w, h, '0');
    fill(s, x + 1, y + 1, w - 2, h - 2, f);
}

function rotate(src, quarters) {
    let s = src;
    for (let q = 0; q < (quarters & 3); q++) {
        const r = new PixelSprite(s.height, s.width);
        for (let y = 0; y < s.height; y++)
            for (let x = 0; x < s.width; x++) {
                const v = s.at(x, y);
                if (v >= 0) r.set(s.height - 1 - y, x, v);      // 90 degrees clockwise
            }
        s = r;
    }
    return s;
}

// grow a sprite by one pixel each side and ring every opaque pixel with black (index 0)
function outline(src) {
    const o = new PixelSprite(src.width + 2, src.height + 2);
    for (let y = 0; y < o.height; y++)
        for (let x = 0; x < o.width; x++) {
            const v = src.at(x - 1, y - 1);
            if (v >= 0) { o.set(x, y, v); continue; }
            let edge = false;
            for (let dy = -1; dy <= 1 && !edge; dy++)
                for (let dx = -1; dx <= 1 && !edge; dx++)
                    if ((dx === 0) !== (dy === 0) && src.at(x - 1 + dx, y - 1 + dy) >= 0) edge = true;
            if (edge) o.set(x, y, 0);
        }
    return o;
}

function shade(body) {
    switch (body) { case '4': return '5'; case '9': return '3'; case 'a': return '3'; case '6': return '7'; default: return 'e'; }
}

// a saloon seen from above, facing right: wheels, outline, lamps, rear window, roof, windscreen
function makeCar(body, sports) {
    const s = new PixelSprite(24, 14);
    fill(s, 3, 0, 5, 14, '0'); fill(s, 16, 0, 5, 14, '0');          // wheels poke out top and bottom
    box(s, 0, 1, 24, 12, body);
    fill(s, 1, 2, 2, 2, 'f'); fill(s, 1, 10, 2, 2, 'f');            // tail lights
    fill(s, 21, 2, 2, 2, 'a'); fill(s, 21, 10, 2, 2, 'a');          // headlights
    if (sports) {
        fill(s, 5, 3, 3, 8, '1');                                   // small rear glass
        fill(s, 13, 3, 5, 8, '1');                                  // raked windscreen
        fill(s, 1, 6, 4, 2, '9'); fill(s, 8, 6, 5, 2, '9'); fill(s, 18, 6, 5, 2, '9');   // racing stripe
        fill(s, 0, 3, 1, 8, '1');                                   // spoiler
    }
    else {
        fill(s, 4, 3, 3, 8, '1');                                   // rear window
        fill(s, 14, 3, 5, 8, '1');                                  // windscreen
        fill(s, 7, 4, 7, 6, shade(body));                           // roof panel
        fill(s, 8, 5, 5, 4, body);
        fill(s, 15, 4, 1, 3, '3');                                  // glint
    }
    return s;
}

function makeVan(body) {
    const s = new PixelSprite(28, 14);
    fill(s, 3, 0, 5, 14, '0'); fill(s, 20, 0, 5, 14, '0');
    box(s, 0, 1, 28, 12, body);
    fill(s, 1, 2, 2, 2, 'f'); fill(s, 1, 10, 2, 2, 'f');
    fill(s, 25, 2, 2, 2, 'a'); fill(s, 25, 10, 2, 2, 'a');
    for (let x = 3; x < 20; x += 3) fill(s, x, 3, 1, 8, shade(body));  // roof ribs
    fill(s, 21, 3, 3, 8, '1');                                      // windscreen
    fill(s, 22, 4, 1, 3, '3');
    fill(s, 5, 6, 12, 2, '4');                                      // courier-yellow stripe
    return s;
}

function makeTruck(cab) {
    const s = new PixelSprite(46, 14);
    for (const x of [3, 9, 25, 38]) fill(s, x, 0, 5, 14, '0');
    box(s, 0, 1, 34, 12, 'a');                                      // the box trailer
    for (let x = 3; x < 33; x += 4) fill(s, x, 2, 1, 10, '3');
    fill(s, 1, 2, 1, 2, 'f'); fill(s, 1, 10, 1, 2, 'f');
    fill(s, 34, 5, 2, 4, '1');                                      // the hitch
    box(s, 35, 1, 11, 12, cab);                                     // the cab
    fill(s, 39, 3, 3, 8, '1');
    fill(s, 40, 4, 1, 3, '3');
    fill(s, 36, 3, 2, 8, shade(cab));
    fill(s, 43, 2, 2, 2, 'a'); fill(s, 43, 10, 2, 2, 'a');
    return s;
}

function makeBus() {
    const s = new PixelSprite(54, 14);
    for (const x of [6, 40]) fill(s, x, 0, 6, 14, '0');
    box(s, 0, 1, 54, 12, '4');
    for (let x = 3; x < 46; x += 6) { fill(s, x, 2, 4, 2, '1'); fill(s, x, 10, 4, 2, '1'); }   // side windows
    fill(s, 3, 5, 42, 4, '5');                                      // roof walkway
    for (let x = 6; x < 44; x += 8) fill(s, x, 6, 3, 2, '4');       // roof vents
    fill(s, 48, 3, 3, 8, '1');                                      // windscreen
    fill(s, 49, 4, 1, 3, '3');
    fill(s, 1, 2, 1, 2, 'f'); fill(s, 1, 10, 1, 2, 'f');
    fill(s, 52, 2, 1, 2, 'a'); fill(s, 52, 10, 1, 2, 'a');
    return s;
}

// ------------------------------------------------------------------ the sprites
// the courier from above, riding up the screen: tyres, bars and gloves, a white helmet with
// a red stripe, the safety-yellow jacket with a reflective band, the red mail bag; then a
// 1 px black outline all round (18 x 18) so he reads on asphalt, grass, logs and the bus
const courierUp = outline(PixelSprite.fromRows(
    '......3333......',
    '......3113......',
    '......3113......',
    '.44333333333344.',
    '..45..9999..54..',
    '...4599ff9954...',
    '..44499ff99444..',
    '..444444444444..',
    '..4aaaaaaaaaa4..',
    '..444444444444..',
    '...4444444fff...',
    '....44444ffaf...',
    '.....554ffff....',
    '......3113......',
    '......3113......',
    '......3333......'));

// [dir4] for the courier; vehicles face right and flip for left
export const Courier = [];
Courier[Dir4.Up] = courierUp;
Courier[Dir4.Right] = rotate(courierUp, 1);
Courier[Dir4.Down] = rotate(courierUp, 2);
Courier[Dir4.Left] = rotate(courierUp, 3);
export const CourierIcon = courierUp;

// body colour per variant: yellow cab, white, teal, red
export const Cars = [], Vans = [], Sports = [], Trucks = [];
{
    const body = ['4', '9', '6', 'f'];
    for (let v = 0; v < 4; v++) {
        Cars[v] = makeCar(body[v], false);
        Sports[v] = makeCar(v % 2 === 0 ? 'f' : '4', true);
        Vans[v] = makeVan(v % 2 === 0 ? '9' : 'a');
        Trucks[v] = makeTruck(body[v]);
    }
}
export const Bus = makeBus();

export const TurtleUp = PixelSprite.fromRows(
    '...cc.....cc....',
    '...ccc...ccc....',
    '....00000000....',
    '...0bbcbbcbb0...',
    '..0bcccbbcccb0..',
    '..0bbcbbbbcbb0bb',
    '..0bbbbccbbbb0b0',
    '..0bbbbccbbbb0bb',
    '..0bbcbbbbcbb0..',
    '..0bcccbbcccb0..',
    '...0bbcbbcbb0...',
    '....00000000....',
    '...ccc...ccc....',
    '...cc.....cc....');
export const TurtleSink = PixelSprite.fromRows(
    '................',
    '................',
    '....77777777....',
    '...7cc7cc7cc7...',
    '..7cc7cccc7cc7..',
    '..7cccc77cccc7..',
    '..7cc7cccc7cc7..',
    '..7cccc77cccc7..',
    '..7cc7cccc7cc7..',
    '..7cccc77cccc7..',
    '...7cc7cc7cc7...',
    '....77777777....',
    '................',
    '................');
export const Fly = PixelSprite.fromRows(
    '....f..f....',
    '.99.bbbb.99.',
    '9aa9bbbb9aa9',
    '9aaa9bb9aaa9',
    '.9aa9bb9aa9.',
    '..99bbbb99..',
    '....bccb....',
    '...bbccbb...',
    '...bccccb...',
    '....bccb....',
    '.....bb.....',
    '............');
export const Envelope = PixelSprite.fromRows(
    '00000000000000',
    '09999999999990',
    '0a9999999999a0',
    '09a99999999a90',
    '099a999999a990',
    '0999a9999a9990',
    '09999aaaa99990',
    '09999999999990',
    '09999999999990',
    '00000000000000');

// ------------------------------------------------------------------ the title card's picture
function stamp(dst, src, x, y, flip = false) {
    for (let j = 0; j < src.height; j++)
        for (let i = 0; i < src.width; i++) {
            const v = src.at(flip ? src.width - 1 - i : i, j);
            if (v >= 0) dst.set(x + i, y + j, v);
        }
}

// a slice of the field: a log and turtles on the river, the kerb, the bus and a cab in the
// road, and the courier caught mid-hop between them over his own shadow
export function buildTitleArt() {
    const W = 256, H = 40;
    const a = new PixelSprite(W, H);
    // the river: a long log, a turtle trio, ripples
    fill(a, 0, 0, W, 16, '6');
    for (let k = 0; k < 12; k++) { fill(a, (k * 23 + 7) % W, 3 + (k % 3) * 4, 5, 1, '8'); fill(a, (k * 23 + 9) % W, 4 + (k % 3) * 4, 5, 1, '7'); }
    const log = new PixelSprite(80, 14);
    fill(log, 1, 0, 78, 14, 'e'); fill(log, 0, 1, 80, 12, 'e'); fill(log, 2, 1, 76, 12, 'd'); fill(log, 3, 2, 74, 2, '5');
    for (let k = 6; k < 74; k += 11) { fill(log, k, 6, 6, 1, 'e'); fill(log, k + 4, 9, 5, 1, 'e'); }
    fill(log, 1, 3, 2, 8, '5'); fill(log, 77, 3, 2, 8, '5');
    stamp(a, log, 4, 1);
    for (let k = 0; k < 3; k++) stamp(a, TurtleUp, 164 + k * 16, 1, true);
    // the median
    fill(a, 0, 16, W, 6, 'b'); fill(a, 0, 16, W, 1, '3'); fill(a, 0, 21, W, 1, '3');
    for (let x = 3; x < W; x += 7) a.set(x, 18 + (x % 3), idx('c'));
    // the road: a cab, the bus, a sports car
    fill(a, 0, 22, W, 18, '2'); fill(a, 0, 22, W, 1, '4');
    for (let x = 2; x < W; x += 16) fill(a, x, 39, 8, 1, '9');
    stamp(a, Cars[0], 14, 24);
    stamp(a, Bus, 136, 24, true);
    stamp(a, Sports[0], 214, 24);
    // the courier, mid-hop off the road toward the river, his shadow on the grass
    for (let j = 0; j < 12; j++) for (let i = 0; i < 12; i++) if (((i + j) & 1) === 0) a.set(99 + i, 17 + j, 0);
    stamp(a, Courier[Dir4.Up], 96, 7);
    return a;
}
