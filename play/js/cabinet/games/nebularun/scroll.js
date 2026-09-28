// THE NODE · world 1 · NEBULA RUN on the Cabinet Engine · THE SCROLL (a helper local to this game).
// Port of Staging/Batch4/nebularun/Games/NebulaRun/NebulaScroll.cs.
//
// Two spaces:
//   MAP space     x = screen x, y = distance flown, growing UP the ground map (0 = the sector start)
//   SCREEN space  the tube: y grows DOWN, the playfield is the rect below
// Pos is the map y under the BOTTOM row of the playfield. The ground scrolls down the tube as Pos
// grows; it stops at Stop, where the fortress sits parked in the upper field. Checkpoints are map
// positions; a lost ship respawns at the last one passed.
export class NebulaScroll {
    constructor() {
        this.pos = 0;               // map y at the field's bottom row
        this.speed = 0;             // px/s
        this.stop = 0;              // pos never passes this (the fortress is parked)
        this.checkpoints = [];
    }

    setup(speed, stop) {
        this.speed = speed; this.stop = stop; this.pos = 0;
        this.checkpoints.length = 0;
    }

    advance(dt) {
        if (this.pos < this.stop) this.pos = Math.min(this.stop, this.pos + this.speed * dt);
    }

    get parked() { return this.pos >= this.stop - 0.001; }
    get progress() { return this.stop > 0 ? Math.min(1, this.pos / this.stop) : 1; }

    toScreenY(mapY) { return NebulaScroll.FieldBottom - (mapY - this.pos); }
    toMapY(screenY) { return this.pos + (NebulaScroll.FieldBottom - screenY); }

    // is a thing of this half-size at this map y anywhere on the field
    onField(mapY, half) {
        const sy = this.toScreenY(mapY);
        return sy > NebulaScroll.FieldY - half && sy < NebulaScroll.FieldBottom + half;
    }

    lastCheckpoint(pos) {
        let best = 0;
        for (const c of this.checkpoints) if (c <= pos + 0.01 && c > best) best = c;
        return best;
    }

    checkpointIndex(pos) {
        let n = 0;
        for (let i = 0; i < this.checkpoints.length; i++) if (this.checkpoints[i] <= pos + 0.01) n = i;
        return n;
    }
}

// the playfield on the 320x240 tube: under the HUD band, inside the 8 px safe area
NebulaScroll.FieldX = 8; NebulaScroll.FieldY = 31; NebulaScroll.FieldW = 304; NebulaScroll.FieldH = 201;
NebulaScroll.FieldRight = NebulaScroll.FieldX + NebulaScroll.FieldW - 1;       // 311
NebulaScroll.FieldBottom = NebulaScroll.FieldY + NebulaScroll.FieldH - 1;      // 231
