// THE NODE · world 1 · SUNSET DRIVE on the Cabinet Engine · the geometry every file agrees on.
//
// The road is the classic sprite-scaler model: a list of SEG-long segments, each with a curve, a height
// and up to two road centres (two only at the fork). x is measured in ROAD HALF-WIDTHS on a global line
// (0 = the start road's centre, +-1 = its edges); z in world units along the course.
// The camera sits CAM_H above the road, CAR_Z behind the player's car; FOCAL is the projection in
// screen pixels (sx = 160 + (wx - camX) * FOCAL / z). Nothing here touches the DOM.

export const VIEW_X0 = 8, VIEW_Y0 = 8, VIEW_X1 = 312, VIEW_Y1 = 232;   // the 8 px safe area
export const VIEW_CX = 160;
export const HORIZON = 106;                 // screen row of the horizon on level road
export const CAR_BOTTOM = 227;              // the player's tyres touch this row

export const SEG = 200;                     // world units per segment
export const RUMBLE = 3;                    // segments per light/dark band
export const ROAD_W = 1400;                 // road half-width, world units
export const LANES = 3;
export const CAM_H = 1000;                  // camera height over the road
export const FOCAL = 152 / Math.tan(50 * Math.PI / 180);   // 100 degree field of view over 304 px
export const CAR_Z = FOCAL * CAM_H / (CAR_BOTTOM - HORIZON); // the car sits this far ahead of the camera
export const DRAW = 180;                    // segments drawn ahead

export const MAXS = 12000;                  // top speed, world units per second (60 segments/s)
export const KMH = 293;                     // what the speedo reads at MAXS

// the player's car, world units: 640 wide (74 px at the car), about 420 long
export const CAR_HALF = 320 / ROAD_W;       // half-width in road half-widths
export const CAR_LEN = 420;

// the four terrains (a stage each) and what the HUD calls them
export const Ter = Object.freeze({ Coast: 0, Canyon: 1, Hills: 2, Bay: 3 });
export const TER_NAMES = Object.freeze(['PALM COAST', 'CANYON RUN', 'VISTA HILLS', 'SUNSET BAY']);

// segment marks
export const Mark = Object.freeze({ None: 0, Start: 1, Checkpoint: 2, ForkTip: 3, Goal: 4 });
