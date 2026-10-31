// THE NODE · world 1 · NEBULA RUN on the Cabinet Engine · THE THINGS (data only): what flies, what stands on the ground,
// how big each one is and what it pays. Split from round.js so the round, the bosses, the picture and the bot can all
// read it without an import cycle.
//
//   AIR (the gun hits them)      spinner 100, dart 150, disc 200 (3 hits), weaver 150, mine 50 (2 hits), carrier 300
//                                (3 hits, drops a pod), the THUNDERHEAD's wing pods 800 and its eye 3000
//   GROUND (the bomb hits them)  silo 200, turret 300, tank 400, supply dump 500 (drops a pod), radar core 500, flak gun
//                                350, shield generator 400, bunker 600 (2 bombs), the crawler's cannon 800, a hangar 800,
//                                the mother's iris 3000, a boss heart 2000; the hidden beacon pays in the tally (5000)
export const AirKind = Object.freeze({ Spinner: 0, Dart: 1, Disc: 2, Weaver: 3, Mine: 4, Carrier: 5, Pod: 6, Eye: 7 });
export const GroundKind = Object.freeze({
    Silo: 0, Turret: 1, Tank: 2, Dump: 3, Core: 4, Flak: 5, Gen: 6, Bunker: 7, Cannon: 8, Hangar: 9, Iris: 10, Beacon: 11, Heart: 12,
});
export const CapKind = Object.freeze({ Wide: 0, Cluster: 1, Bonus: 2 });

//                   Spinner Dart Disc Weaver Mine Carrier Pod  Eye
const AIR_R =       [7,      6,   11,  7,     6,   10,     10,  14];
const AIR_PTS =     [100,    150, 200, 150,   50,  300,    800, 3000];
//                   Silo Turret Tank Dump Core Flak Gen  Bunker Cannon Hangar Iris  Beacon Heart
const GND_R =       [8,   9,     9,   11,  10,  9,   10,  10,    11,    12,    13,   9,     12];
const GND_PTS =     [200, 300,   400, 500, 500, 350, 400, 600,   800,   800,   3000, 0,     2000];

export function airRadius(e) { return AIR_R[e.kind]; }
export function airPoints(e) { return AIR_PTS[e.kind]; }
export function groundRadius(g) { return GND_R[g.kind]; }
export function groundPoints(g) { return GND_PTS[g.kind]; }

// a ground thing under a live generator's dome: bombs bounce off it
export function isShielded(g) {
    if (g.guards == null) return false;
    for (const o of g.guards) if (o.alive) return true;
    return false;
}
