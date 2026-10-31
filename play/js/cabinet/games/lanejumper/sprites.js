// THE NODE · world 1 · LANE JUMPER on the Cabinet Engine · THE SPRITES and the title card's picture.
// Grown from the static part of LaneJumperRenderer.cs (its static constructor, the sprite makers and
// BuildTitleArt), split out so spec.js (title art) and renderer.js can both read it without an import cycle.
// The build-out added the motorbike, the train, the ferry, the mudjaw (shut, burning, open), the snake, the dog,
// the bonus stamp and the parcel.
//
// Palette indices (spec.js): 0 bg, 1 asphaltDark, 2 asphalt, 3 asphaltLight, 4 yellow, 5 amber, 6 teal,
// 7 tealDark, 8 tealLight, 9 white, a cream, b green, c greenDark, d brown, e brownDark, f red, g night,
// h navy, i orange, j maroon.
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

// a motorbike and rider from above, facing right: tyres end on, the tank, the bars, a white helmet
function makeMoto(body, jacket) {
    const s = new PixelSprite(16, 12);
    fill(s, 0, 5, 4, 2, '0'); fill(s, 12, 5, 4, 2, '0');           // tyres
    fill(s, 0, 5, 1, 2, 'f'); fill(s, 15, 5, 1, 2, 'a');           // tail light, headlamp
    fill(s, 3, 4, 9, 4, '0');
    fill(s, 4, 5, 7, 2, body);                                      // tank and seat
    fill(s, 11, 1, 1, 10, '3');                                     // the bars
    fill(s, 11, 0, 1, 2, '0'); fill(s, 11, 10, 1, 2, '0');          // grips
    fill(s, 4, 2, 5, 8, '0');
    fill(s, 5, 3, 3, 6, jacket);                                    // the rider's back
    fill(s, 8, 2, 3, 1, jacket); fill(s, 8, 9, 3, 1, jacket);       // arms to the grips
    fill(s, 6, 4, 3, 4, '9'); fill(s, 8, 5, 1, 2, '1');             // helmet and visor
    return s;
}

// the train from above, heading right: four maroon coaches (side windows, roof vents) and the red engine
// with its hazard-striped nose and headlamp
function makeTrain() {
    const s = new PixelSprite(176, 14);
    for (let c = 0; c < 4; c++) {
        const x = c * 36;
        box(s, x, 0, 34, 14, 'j');
        fill(s, x + 2, 3, 30, 1, '3'); fill(s, x + 2, 10, 30, 1, '3');     // roof edges
        for (let k = 0; k < 5; k++) { fill(s, x + 3 + k * 6, 1, 4, 1, 'a'); fill(s, x + 3 + k * 6, 12, 4, 1, 'a'); }   // windows
        fill(s, x + 8, 5, 5, 4, '1'); fill(s, x + 21, 5, 5, 4, '1');        // roof vents
        fill(s, x + 9, 6, 3, 2, '3'); fill(s, x + 22, 6, 3, 2, '3');
        fill(s, x + 34, 5, 2, 4, '1');                                     // the coupling
    }
    fill(s, 0, 2, 1, 2, 'f'); fill(s, 0, 10, 1, 2, 'f');                     // tail lamps
    box(s, 144, 0, 32, 14, 'f');                                           // the engine
    fill(s, 146, 4, 16, 6, 'j');                                           // the roof grille
    for (let k = 0; k < 4; k++) fill(s, 147 + k * 4, 5, 2, 4, '1');
    fill(s, 163, 2, 3, 10, '1'); fill(s, 164, 3, 1, 3, '3');               // the cab glass
    fill(s, 167, 1, 8, 12, '4');                                           // the nose: hazard stripes
    for (let k = 0; k < 4; k++) fill(s, 168 + k * 2, 1 + k * 3, 2, 3, '0');
    fill(s, 174, 6, 2, 2, 'a');                                            // the headlamp
    return s;
}

// the ferry from above, bow to the right: white hull, red rubbing strakes, cream deck, the yellow wheelhouse
// and its red funnel
function makeFerry(len) {
    const s = new PixelSprite(len, 14);
    box(s, 0, 0, len - 6, 14, '9');
    for (let k = 0; k < 6; k++) { fill(s, len - 6 + k, k + 1, 1, 12 - 2 * k, '0'); if (k < 5) fill(s, len - 6 + k, k + 2, 1, 10 - 2 * k, '9'); }
    fill(s, 1, 1, len - 7, 1, 'f'); fill(s, 1, 12, len - 7, 1, 'f');        // the strakes
    fill(s, 2, 3, len - 10, 8, 'a');                                       // the deck
    for (let x = 6; x < len - 10; x += 8) fill(s, x, 3, 1, 8, '3');        // planks
    const cx = (len >> 1) - 10;
    box(s, cx, 4, 20, 6, '4');                                             // the wheelhouse roof
    fill(s, cx + 14, 5, 2, 4, '1');
    fill(s, cx + 5, 5, 4, 4, 'f'); fill(s, cx + 6, 6, 2, 2, '0');          // the funnel
    fill(s, 3, 6, 2, 2, '1'); fill(s, len - 12, 6, 2, 2, '1');             // bollards
    return s;
}

// THE MUDJAW from above, heading right: a forked tail, a long muddy back with a green ridge and dark scales,
// and the head (the last 20 px). st: 0 jaws shut (yellow eye), 1 the eyes burn red and the jaw creaks open
// (the telegraph), 2 open: the maroon mouth and white teeth (the head bites)
function makeBeast(st) {
    const s = new PixelSprite(80, 14);
    fill(s, 0, 1, 4, 4, '0'); fill(s, 0, 9, 4, 4, '0'); fill(s, 3, 3, 8, 8, '0');
    fill(s, 1, 2, 2, 2, 'c'); fill(s, 1, 10, 2, 2, 'c'); fill(s, 3, 4, 7, 6, 'c');      // the forked tail
    fill(s, 28, 0, 8, 1, '0'); fill(s, 28, 13, 8, 1, '0');                               // fins
    box(s, 8, 1, 54, 12, 'c');
    fill(s, 10, 3, 50, 2, 'b');                                                          // the ridge
    for (let k = 0; k < 6; k++) { fill(s, 12 + k * 8, 7, 3, 2, '7'); fill(s, 16 + k * 8, 9, 2, 1, '7'); }
    fill(s, 10, 10, 50, 1, '5');                                                         // the belly's edge
    if (st < 2) {
        box(s, 60, 2, 18, 10, 'c');
        fill(s, 77, 4, 3, 6, '0'); fill(s, 77, 5, 2, 4, 'c');                            // the snout
        fill(s, 62, 4, 14, 1, 'b');
        fill(s, 64, 2, 3, 2, st === 1 ? 'f' : '4'); fill(s, 64, 10, 3, 2, st === 1 ? 'f' : '4');   // the eyes
        fill(s, 65, 2, 1, 1, '0'); fill(s, 65, 11, 1, 1, '0');
        fill(s, 63, 7, 15, 1, '0');                                                      // the jaw line
        if (st === 1) { fill(s, 64, 6, 13, 1, 'j'); for (let x = 66; x < 77; x += 3) fill(s, x, 6, 1, 1, '9'); }
        fill(s, 76, 5, 1, 1, '0'); fill(s, 76, 8, 1, 1, '0');                            // nostrils
    }
    else {
        // the jaws splay open: upper and lower jaw out to the sides, the mouth between, teeth on both rims
        fill(s, 60, 0, 20, 4, '0'); fill(s, 61, 1, 18, 2, 'c');
        fill(s, 60, 10, 20, 4, '0'); fill(s, 61, 11, 18, 2, 'c');
        fill(s, 60, 4, 20, 6, 'j'); fill(s, 60, 4, 2, 6, 'c');
        for (let x = 63; x < 80; x += 3) { fill(s, x, 4, 2, 1, '9'); fill(s, x + 1, 9, 2, 1, '9'); }
        fill(s, 62, 6, 15, 2, 'f');                                                      // the tongue
        fill(s, 63, 1, 3, 1, 'f'); fill(s, 63, 12, 3, 1, 'f');                           // eyes, burning
    }
    return s;
}

// the SNAKE, heading right: a green body in an S, yellow bands, the head and a red tongue (two frames)
function makeSnake(frame) {
    const body = new PixelSprite(30, 8);
    for (let x = 0; x < 25; x++) {
        const y = 3 + Math.round(Math.sin((x + frame * 3) * 0.5) * 2 * Math.min(1, (x + 2) / 8));
        const c = x % 6 < 2 ? '4' : 'b';
        body.set(x, y, idx(c)); body.set(x, y + 1, idx(x % 6 < 2 ? '4' : 'c'));
    }
    fill(body, 24, 2, 5, 4, 'b'); fill(body, 25, 2, 3, 1, 'c');                         // the head
    body.set(27, 3, idx('0')); body.set(27, 4, idx('0'));
    const s = outline(body);
    s.set(31, 4, idx('f')); s.set(31, 3, idx(frame ? 'f' : '0'));                        // the tongue
    return s;
}

// THE DOG from above, heading right: orange coat with a brown saddle, ears, a wagging tail; frame 0/1 trot,
// frame 2 the crouch before a chase (ears flat, legs set)
function makeDog(frame) {
    const b = new PixelSprite(18, 10);
    fill(b, 2, 2, 11, 6, 'i');                                                          // the body
    fill(b, 5, 3, 5, 4, 'd');                                                           // the saddle
    fill(b, 12, 1, 5, 8, 'i'); fill(b, 17, 4, 1, 2, '0');                               // the head, the nose
    fill(b, 15, 3, 1, 1, '0'); fill(b, 15, 6, 1, 1, '0');                               // eyes
    if (frame === 2) { fill(b, 12, 0, 3, 1, 'e'); fill(b, 12, 9, 3, 1, 'e'); }          // ears flat
    else { fill(b, 13, 0, 2, 2, 'e'); fill(b, 13, 8, 2, 2, 'e'); }
    fill(b, 0, frame === 1 ? 3 : 5, 3, 2, 'i');                                         // the tail
    const legs = frame === 0 ? [[3, 0], [10, 0], [5, 8], [12, 8]] : frame === 1 ? [[5, 0], [12, 0], [3, 8], [10, 8]] : [[2, 0], [10, 0], [2, 8], [10, 8]];
    for (const [x, y] of legs) fill(b, x, y, 2, 2, 'e');
    return outline(b);
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
export const Motos = [makeMoto('f', 'e'), makeMoto('6', '1'), makeMoto('4', 'e'), makeMoto('9', 'j')];
export const Train = makeTrain();
export const WeaverCar = makeCar('i', true);         // THE WEAVER: the orange sports car
export const Ferry = makeFerry(80);
export const Beast = [makeBeast(0), makeBeast(1), makeBeast(2)];
export const Snake = [makeSnake(0), makeSnake(1)];
export const Dog = [makeDog(0), makeDog(1), makeDog(2)];

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
// the bonus STAMP that sits in an empty slot now and then: perforated edges, a red frame, a gold sun
export const Stamp = PixelSprite.fromRows(
    '.9.9.9.9.9.9',
    '999999999999',
    '.9ffffffff9.',
    '99f444444f99',
    '.9f4a44a4f9.',
    '99f44aa44f99',
    '.9f44aa44f9.',
    '99f4a44a4f99',
    '.9f444444f99',
    '99ffffffff9.',
    '999999999999',
    '.9.9.9.9.9.9');
// the PARCEL: a brown box tied with cream string and a red knot
export const Parcel = PixelSprite.fromRows(
    '000000000000',
    '0ddddaaddde0',
    '0ddddaaddde0',
    '0ddddaaddde0',
    '0aaaaffaaaa0',
    '0aaaaffaaaa0',
    '0ddddaaddde0',
    '0ddddaaddde0',
    '0eeeeaaeeee0',
    '000000000000');
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
