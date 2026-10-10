// THE JUNCTION'S JUKEBOX: the basement jukebox's own meshes (kept aside by world.js as W.jukeParts) stood against the back wall of the
// arcade, a song playing from it (positional), E to pick the next one. Its song is THE room's music: js/answer.js stutters and
// skips it (the answer's knock 2 and the tables), so it is a streamed element behind a THREE.PositionalAudio that the room can pause, resume and stutter (this.music).
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';

const BASE = 'assets/audio/jukebox/';
const TRACKS = ['Neon Drift', 'Gridline Afterglow', 'Chrome Rain', 'Midnight Protocol', 'Analog Ghost', 'Redline Dreams', 'Static Horizon', 'Pulse Arcade', 'Deep Focus 2170', 'Last Light Loop']
  .map((title, i) => ({ title, file: `juke_${String(i + 1).padStart(2, '0')}.mp3` }));      // the full tracks (10-14 minutes each), streamed
/** a tiny silent clip: main.js plays it from the first gesture to unlock the element on phones (iOS only lets a gesture-touched element play later) */
export const SILENT = 'data:audio/wav;base64,UklGRkQDAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YSADAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgA==';
const pick = (a, not) => { const b = a.filter((x) => x !== not); return b[Math.floor(Math.random() * b.length)]; };

export class JunctionJukebox {
  /** parts: W.jukeParts [{ geo (basement world space), mat }]; at: [x, floorY, z] of the back of its foot; facing: unit [x, z] its front looks along;
   *  its back against a wall: wallZ (a back or front wall, at[0] says where along it) or wallX (a side wall, at[2] says where along it) */
  constructor({ parts, listener, element, parent, at, wallZ, wallX, facing = [0, 1], volume = 0.8 }) {
    this.listener = listener; this.track = null; this.n = 0; this.volume = volume;
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
    // its glow: a warm wash on the wall behind it and a pool on the floor in front, painted on (two quads, no light of its own,
    // so it costs the frame nothing; it stands in the shade under the mezzanine)
    const gc = document.createElement('canvas'); gc.width = gc.height = 128;
    const gx = gc.getContext('2d'), gr = gx.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    gx.fillStyle = gr; gx.fillRect(0, 0, 128, 128);
    const glowTex = new THREE.CanvasTexture(gc);
    const glowMat = (o) => new THREE.MeshBasicMaterial({ map: glowTex, color: 0xff8a3c, opacity: o, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const wash = new THREE.Mesh(new THREE.PlaneGeometry(this.size.z * 2.6, this.size.y * 1.6), glowMat(0.32));
    wash.rotation.y = Math.PI / 2; wash.position.set(-this.size.x / 2 - 0.02, this.size.y * 0.62, 0); wash.renderOrder = 1; g.add(wash);
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.9), glowMat(0.22));
    pool.rotation.x = -Math.PI / 2; pool.position.set(this.size.x / 2 + 0.45, 0.012, 0); pool.renderOrder = 1; g.add(pool);
    const th = Math.atan2(-facing[1], facing[0]);                 // local +x -> facing
    g.rotation.y = th;
    const half = this.size.x / 2 + 0.03;
    const x = wallX !== undefined ? wallX + facing[0] * half : at[0], z = wallX !== undefined ? at[2] : wallZ + facing[1] * half;
    g.position.set(x, at[1], z);
    parent.add(g);
    // where you stand to use it, and a foot-print the player cannot walk through
    this.stand = new THREE.Vector3(x + facing[0] * 0.9, at[1] + 1, z + facing[1] * 0.9);
    const w = this.size.z + 0.1, d = this.size.x;
    const cg = new THREE.BoxGeometry(Math.abs(facing[0]) > 0.5 ? d : w, 2, Math.abs(facing[0]) > 0.5 ? w : d).translate(x, at[1] + 1, z);
    cg.deleteAttribute('uv'); cg.deleteAttribute('normal'); this.bvh = new MeshBVH(cg);
    // the music: STREAMED. An HTMLAudioElement (one song loading at a time, never a whole 13-minute track decoded into RAM) routed into the
    // positional panner, so it stays at the jukebox and main.js can duck it with setVolume. `env` is a gain of its own for the stutter's clicks-free slices.
    const a = this.audio = new THREE.PositionalAudio(listener);
    a.setRefDistance(2.2); a.setRolloffFactor(1.1); a.setLoop(false); a.setVolume(volume);
    a.position.set(x, at[1] + 1.1, z); parent.add(a);
    const el = this.el = element || new Audio();
    el.preload = 'none'; el.loop = false; el.crossOrigin = 'anonymous';
    a.hasPlaybackControl = false;                                // (the element plays, not the Audio: so three keeps moving the panner with the jukebox, as for setMediaElementSource)
    const ctx = listener.context;
    this.env = ctx.createGain(); this.env.connect(a.getOutput());
    this.node = ctx.createMediaElementSource(el); this.node.connect(this.env);
    this.on = false; this.playing = false; this._tok = 0; this._fails = 0;
    el.addEventListener('ended', () => { if (this.on && this.playing) this.play(pick(TRACKS, this.track)); });     // the next song
    el.addEventListener('error', () => { if (this.on && this.playing && el.src && !el.src.startsWith('data:') && ++this._fails < 4) this.play(pick(TRACKS, this.track)); });
    // what js/answer.js talks to: it pauses and resumes the room's music and makes it stutter (see answer.js _stutter)
    const self = this;
    this.music = {
      get isPlaying() { return self.playing; },
      pause() { self._tok++; self.playing = false; self.el.pause(); self.env.gain.cancelScheduledValues(0); self.env.gain.value = 1; },
      play() { if (self.playing || !self.track) return; self.playing = true; self.env.gain.value = 1; self._resume(); },
      stutter(S) { return self._stutter(S); },
    };
  }
  _resume() { const tok = this._tok, p = this.el.play(); if (p && p.catch) p.catch((e) => { if (tok === this._tok && e && e.name !== 'AbortError') { this.playing = false; this.blocked = e.name === 'NotAllowedError'; } }); }     // (an AbortError is only a newer load or pause taking over)
  /** a slice of the song just played, S.reps times, a gap, then on from where it was (the seek-back-and-replay of a media element) */
  async _stutter(S) {
    const el = this.el, env = this.env.gain, ctx = this.listener.context;
    if (!this.playing || el.paused || !isFinite(el.currentTime)) return false;
    const tok = ++this._tok, pos = el.currentTime, start = Math.max(0, pos - S.slice), ms = (t) => new Promise((r) => setTimeout(r, t * 1000));
    const live = () => tok === this._tok;
    for (let i = 0; i < S.reps; i++) {
      env.cancelScheduledValues(ctx.currentTime); env.setValueAtTime(0, ctx.currentTime);
      el.currentTime = start; if (el.paused) await el.play().catch(() => {});
      if (!live()) return false;
      const t = ctx.currentTime + 0.012;                         // (the seek lands a few ms late: open the gain after it)
      env.linearRampToValueAtTime(1, t + 0.004); env.setValueAtTime(1, t + S.slice - 0.012); env.linearRampToValueAtTime(0, t + S.slice - 0.006);
      await ms(S.slice); if (!live()) return false;
    }
    el.pause(); el.currentTime = pos;
    await ms(S.gap); if (!live()) return false;
    env.cancelScheduledValues(ctx.currentTime); env.setValueAtTime(1, ctx.currentTime);
    await el.play().catch(() => {});
    return true;
  }
  /** start a song (a random one), unless one is already playing */
  start() {
    this.on = true;
    if (this.playing) return true;
    return this.play(pick(TRACKS));
  }
  stop() { this.on = false; this.music.pause(); }
  play(name) {
    const t = TRACKS.find((x) => x.file === name.file); if (!t) return false;
    const el = this.el; this._tok++;
    el.pause(); this.env.gain.cancelScheduledValues(0); this.env.gain.value = 1;
    el.preload = 'auto'; el.src = BASE + t.file; el.currentTime = 0;     // (only this song is loading; a src change drops the last one's request)
    this.track = t; this.playing = true; this.n++;
    this._resume();
    return true;
  }
  /** E: the next song (never the same one twice running); returns its title */
  next() { this.on = true; const t = pick(TRACKS, this.track); this.play(t); return t.title; }
  /** test hook: jump inside the song */
  seek(s) { this.el.currentTime = s < 0 ? Math.max(0, (this.el.duration || 0) + s) : s; }
  info() { const e = this.el; return { track: this.track && this.track.file, title: this.track && this.track.title, playing: this.playing && !e.paused, n: this.n,
    time: e.currentTime, duration: e.duration, buffered: e.buffered.length ? e.buffered.end(e.buffered.length - 1) : 0, at: this.group.position.toArray(), size: this.size.toArray() }; }
}
