// THE NODE · HEARTH (cabinet level 1) · THE CAVE'S LAYOUT, measured off assets/looktest/hearth_plate.png.
// Pure data + geometry helpers: shared by the sim (headless, Node-safe) and the view. Coordinates are the plate's
// pixels (1266 x 952), x right, y DOWN.

export const FRAME = [1266, 952];
export const HEARTH = [626, 519];                      // the painted ring of stones
export const PIT = [628, 513];                         // the hollow the fire sits in
export const RING = { x: 626, y: 519, rx: 88, ry: 42 };  // solid: the ring itself (you can't walk through it)
export const FEED = { x: 626, y: 519, rx: 118, ry: 60 }; // touch this with fuel in hand: it goes into the fire
export const BITE = { x: 626, y: 515, rx: 100, ry: 50 }; // a shade inside this bites the fire
export const POSTS = [{ x: 500, y: 535, rx: 38, ry: 16 }, { x: 752, y: 527, rx: 48, ry: 18 }];   // post footprints

// the walkable floor (inside the painted rock band)
export const FLOOR = [[205, 392], [300, 372], [420, 352], [470, 340], [560, 300], [660, 288], [770, 300], [840, 330],
  [905, 395], [980, 418], [1060, 440], [1092, 478], [1085, 600], [1048, 660], [985, 712], [930, 748], [860, 775],
  [760, 830], [640, 856], [520, 846], [420, 812], [350, 770], [290, 720], [240, 672], [195, 620], [170, 560], [172, 470]];

// the shade openings, in the order they open up during the minute: `at` inside the dark, `exit` where they reach the floor
export const OPENINGS = [
  { name: 'left', at: [90, 565], exit: [205, 572] },
  { name: 'right', at: [1146, 557], exit: [1068, 556] },
  { name: 'top', at: [686, 120], exit: [676, 305] },
  { name: 'lowLeft', at: [300, 812], exit: [348, 756] },
  { name: 'lowRight', at: [902, 808], exit: [866, 754] },
];

// the painted animals' charge lanes across the floor (they leave the wall and run these)
export const BULL_LANE = { a: [150, 402], b: [1110, 462] };
export const DEER_LANE = { a: [1120, 690], b: [180, 694] };

export function inPoly(x, y, poly = FLOOR) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
/** Elliptical distance: < 1 inside. */
export function eDist(x, y, e) { const dx = (x - e.x) / e.rx, dy = (y - e.y) / e.ry; return Math.sqrt(dx * dx + dy * dy); }
/** Can a body stand here? (on the floor, off the ring and the posts) */
export function walkable(x, y) {
  if (!inPoly(x, y)) return false;
  if (eDist(x, y, RING) < 1) return false;
  for (const p of POSTS) if (eDist(x, y, p) < 1) return false;
  return true;
}
