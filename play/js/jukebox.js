// THE JUNCTION'S JUKEBOX: the basement jukebox's own meshes (kept aside by world.js as W.jukeParts) stood against the back wall of the
// arcade, a song playing from it (positional), E to pick the next one. Its song is THE room's music: js/answer.js stutters and
// skips it (the answer's knock 2 and the tables), so it is a THREE.PositionalAudio the room can pause and resume.
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';

const TRACKS = ['juke_02.mp3', 'juke_06.mp3', 'juke_09.mp3'];     // the basement jukebox's recordings
const pick = (a, not) => { const b = a.filter((x) => x !== not); return b[Math.floor(Math.random() * b.length)]; };

export class JunctionJukebox {
  /** parts: W.jukeParts [{ geo (basement world space), mat }]; at: [x, floorY, z] of the back of its foot; facing: unit [x, z] its front looks along */
  constructor({ parts, listener, buffers, parent, at, wallZ, facing = [0, 1], volume = 0.8 }) {
    this.listener = listener; this.buffers = buffers; this.track = null; this.n = 0; this.volume = volume;
    const box = new THREE.Box3(); for (const p of parts) { p.geo.computeBoundingBox(); box.union(p.geo.boundingBox); }
    const c = box.getCenter(new THREE.Vector3());
    this.size = box.getSize(new THREE.Vector3());                 // x = depth (front is +x), y = height, z = width
    const g = this.group = new THREE.Group(); g.name = 'JunctionJukebox';
    for (const p of parts) {
      const geo = p.geo.clone().translate(-c.x, -box.min.y, -c.z);
      const mat = p.mat.clone(); mat.lightMap = null; mat.envMapIntensity = 0.6;
      if (mat.emissive.getHex() === 0 && !mat.transparent) { mat.emissive.copy(mat.color).multiplyScalar(0.45); if (mat.map) mat.emissiveMap = mat.map; }   // (the room is lit by its bake: lift it so it reads, with no light of its own)
      const m = new THREE.Mesh(geo, mat); m.renderOrder = mat.transparent ? 2 : 0; g.add(m);
    }
    const th = Math.atan2(-facing[1], facing[0]);                 // local +x -> facing
    g.rotation.y = th;
    const x = at[0], z = wallZ + this.size.x / 2 + 0.03;
    g.position.set(x, at[1], z);
    parent.add(g);
    // where you stand to use it, and a foot-print the player cannot walk through
    this.stand = new THREE.Vector3(x + facing[0] * 0.9, at[1] + 1, z + facing[1] * 0.9);
    const w = this.size.z + 0.1, d = this.size.x;
    const cg = new THREE.BoxGeometry(Math.abs(facing[0]) > 0.5 ? d : w, 2, Math.abs(facing[0]) > 0.5 ? w : d).translate(x, at[1] + 1, z);
    cg.deleteAttribute('uv'); cg.deleteAttribute('normal'); this.bvh = new MeshBVH(cg);
    // the music
    const a = this.audio = new THREE.PositionalAudio(listener);
    a.setRefDistance(2.2); a.setRolloffFactor(1.1); a.setLoop(false); a.setVolume(volume);
    a.position.set(x, at[1] + 1.1, z); parent.add(a);
    const ended = a.onEnded.bind(a);
    a.onEnded = () => { ended(); if (this.on) this.play(pick(TRACKS, this.track)); };      // the next song
    this.on = false;
  }
  /** start a song (a random one), unless one is already playing */
  start() {
    this.on = true;
    if (this.audio.isPlaying) return true;
    return this.play(pick(TRACKS));
  }
  stop() { this.on = false; if (this.audio.isPlaying) this.audio.stop(); }
  play(name) {
    const buf = this.buffers[name]; if (!buf) return false;
    const a = this.audio; if (a.isPlaying) a.stop();
    a.setBuffer(buf); a.setLoop(false); a.play(); this.track = name; this.n++;
    return true;
  }
  /** E: the next song (never the same one twice running) */
  next() { this.on = true; const name = pick(TRACKS, this.track); this.play(name); return name; }
  info() { return { track: this.track, playing: this.audio.isPlaying, n: this.n, at: this.group.position.toArray(), size: this.size.toArray() }; }
}
