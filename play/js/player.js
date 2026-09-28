// First-person walker. Matches NodePlayer + its CharacterController: 2.4 m/s, eye 1.62 m, radius 0.3,
// height 1.75, step 0.25, bob 0.025 @ 9. Collision is circle-vs-box against Unity's own box colliders
// (all axis-aligned in the basement), so it walks exactly where the Unity player walks.
import * as THREE from 'three';

export class Player {
  constructor(camera, colliders) {
    this.cam = camera;
    this.boxes = colliders.map((c) => ({
      minX: c.c[0] - c.he[0], maxX: c.c[0] + c.he[0],
      minY: c.c[1] - c.he[1], maxY: c.c[1] + c.he[1],
      minZ: c.c[2] - c.he[2], maxZ: c.c[2] + c.he[2], name: c.name,
    }));
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0; this.roll = 0;
    this.eye = 1.62; this.eyeNow = 1.62;
    this.radius = 0.3; this.height = 1.75; this.step = 0.27;
    this.speed = 2.4; this.bobT = 0; this.bob = 0;
    this.vy = 0; this.control = false;
    this.sens = 1; this.invert = false;
    this.lookOverride = null;      // {pos, target, t} while at a cabinet or the board
    this.moved = 0;
  }
  place(x, y, z, yaw) { this.pos.set(x, y, z); this.yaw = yaw; this.pitch = 0; this.vel.set(0, 0, 0); }
  look(dx, dy) {
    if (!this.control) return;
    const k = 0.0022 * this.sens;
    this.yaw -= dx * k;
    this.pitch -= dy * k * (this.invert ? -1 : 1);
    this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch));
  }
  update(dt, keys) {
    if (this.control) {
      const turn = (keys.has('ArrowLeft') ? 1 : 0) - (keys.has('ArrowRight') ? 1 : 0);
      this.yaw += turn * 1.9 * dt;
      const fwd = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
      const side = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
      const hurry = keys.has('ShiftLeft') || keys.has('ShiftRight') ? 1.65 : 1;
      const want = new THREE.Vector3(
        -Math.sin(this.yaw) * fwd + Math.cos(this.yaw) * side, 0,
        -Math.cos(this.yaw) * fwd - Math.sin(this.yaw) * side);
      if (want.lengthSq() > 1) want.normalize();
      want.multiplyScalar(this.speed * hurry);
      const a = 1 - Math.exp(-dt * 14);
      this.vel.x += (want.x - this.vel.x) * a; this.vel.z += (want.z - this.vel.z) * a;
    } else { this.vel.x = 0; this.vel.z = 0; }

    const move = this.vel.clone().multiplyScalar(dt);
    const n = Math.max(1, Math.ceil(move.length() / 0.08));
    for (let i = 0; i < n; i++) this.slide(move.x / n, move.z / n);

    // ground: the highest box top under the circle that is within a step of the feet
    let ground = -10;
    for (const b of this.boxes) {
      if (b.maxY > this.pos.y + this.step) continue;
      if (this.overlaps(b, this.pos.x, this.pos.z, this.radius * 0.7)) ground = Math.max(ground, b.maxY);
    }
    if (ground > this.pos.y) { this.pos.y = Math.min(ground, this.pos.y + dt * 6); this.vy = 0; }
    else if (ground < this.pos.y - 0.001) { this.vy -= 9.8 * dt; this.pos.y = Math.max(ground, this.pos.y + this.vy * dt); }
    else this.vy = 0;

    const sp = Math.hypot(this.vel.x, this.vel.z);
    this.moved += sp * dt;
    this.bobT += dt * 9 * Math.min(1, sp / 2.4);
    this.bob += ((sp > 0.2 ? Math.sin(this.bobT) * 0.025 : 0) - this.bob) * Math.min(1, dt * 8);
  }
  overlaps(b, x, z, r) {
    const cx = Math.max(b.minX, Math.min(x, b.maxX)), cz = Math.max(b.minZ, Math.min(z, b.maxZ));
    return (x - cx) ** 2 + (z - cz) ** 2 < r * r;
  }
  slide(dx, dz) {
    this.pos.x += dx; this.pos.z += dz;
    const feet = this.pos.y, top = this.pos.y + this.height;
    for (let it = 0; it < 3; it++) {
      for (const b of this.boxes) {
        if (b.maxY <= feet + this.step || b.minY >= top) continue;       // under a step or over the head
        const cx = Math.max(b.minX, Math.min(this.pos.x, b.maxX)), cz = Math.max(b.minZ, Math.min(this.pos.z, b.maxZ));
        let ox = this.pos.x - cx, oz = this.pos.z - cz; const d2 = ox * ox + oz * oz;
        if (d2 >= this.radius * this.radius) continue;
        if (d2 < 1e-10) {       // centre inside the box: push out along the shallowest side
          const pen = [this.pos.x - b.minX, b.maxX - this.pos.x, this.pos.z - b.minZ, b.maxZ - this.pos.z];
          const k = pen.indexOf(Math.min(...pen));
          if (k === 0) this.pos.x = b.minX - this.radius; else if (k === 1) this.pos.x = b.maxX + this.radius;
          else if (k === 2) this.pos.z = b.minZ - this.radius; else this.pos.z = b.maxZ + this.radius;
          continue;
        }
        const d = Math.sqrt(d2), push = this.radius - d;
        this.pos.x += (ox / d) * push; this.pos.z += (oz / d) * push;
      }
    }
  }
  apply(dt) {
    const c = this.cam;
    if (this.lookOverride) {
      const o = this.lookOverride;
      o.t = Math.min(1, o.t + dt / 0.55);
      const s = o.t * o.t * (3 - 2 * o.t);
      c.position.lerpVectors(o.fromPos, o.pos, s);
      c.quaternion.slerpQuaternions(o.fromQ, o.q, s);
      return;
    }
    c.position.set(this.pos.x, this.pos.y + this.eyeNow + this.bob, this.pos.z);
    c.rotation.set(this.pitch, this.yaw, this.roll, 'YXZ');
  }
  // glide the camera to stand square in front of a screen; returns the override so it can be released
  lookAt(center, normal, dist) {
    const pos = center.clone().addScaledVector(normal, dist);
    const m = new THREE.Matrix4().lookAt(pos, center, new THREE.Vector3(0, 1, 0));
    this.lookOverride = { fromPos: this.cam.position.clone(), fromQ: this.cam.quaternion.clone(), pos, q: new THREE.Quaternion().setFromRotationMatrix(m), t: 0 };
  }
  release() {
    if (!this.lookOverride) return;
    // hand the view back where the player was standing, facing the thing they were using
    const o = this.lookOverride; this.lookOverride = null;
    const e = new THREE.Euler().setFromQuaternion(o.q, 'YXZ');
    this.yaw = e.y; this.pitch = 0;
  }
  forward() { return new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)); }
}
