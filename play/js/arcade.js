// Flynn's floor (his ruling 2026-09-26): every cabinet in the arcade runs its own playable game, no repeats.
// Our three stand at the front left (main.js wires them); the 21 uprights and the 2 sit-downs are listed here with
// the game each one runs. Each cabinet wears its game's art (side panels, control panel, lit marquee: the Codex packs
// in assets/cab/) and gets a place to stand (or sit) square in front of its screen.
import * as THREE from 'three';

const FI = 'Outside/Flynns/FlynnsInterior/';
export const FLOOR = {
  // front row, facing the door
  FFiller_0: 'warlordsroad', FFiller_1: 'deepkeep', FFiller_2: 'hyperdrift',
  // second row (backs to the first)
  FFiller_3: 'lancerider', FFiller_4: 'swarmpatrol', FFiller_5: 'lastlight', FFiller_6: 'sporefield', FFiller_7: 'lasthuman', FFiller_8: 'castlecrush',
  // third row
  FFiller_9: 'mudmetal', FFiller_10: 'route9', FFiller_11: 'lanejumper', FFiller_12: 'tunnelrat', FFiller_13: 'vaultdigger', FFiller_14: 'stackattack',
  // back row
  FFiller_15: 'irondojo', FFiller_16: 'ironworks', FFiller_17: 'lunarduty', FFiller_18: 'nebularun', FFiller_19: 'shortorder', FFiller_20: 'spritepop',
  // the two sit-downs on your right as you walk in
  FFillerSit_0: 'sunsetdrive', FFillerSit_1: 'afterglow',
};
export const SIT = new Set(['FFillerSit_0', 'FFillerSit_1']);

const texLoader = new THREE.TextureLoader();
const texCache = new Map();
function art(game, part) {
  const key = game + '_' + part;
  if (!texCache.has(key)) {
    const t = texLoader.load('assets/cab/' + key + '.jpg', undefined, undefined, () => {});
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    texCache.set(key, t);
  }
  return texCache.get(key);
}

// swap the cabinet's side, control-panel and marquee art for its game's (the kit's slots are M_FillSide_* etc.)
export function dressCabinet(O, cab, game) {
  for (const [p, meshes] of Object.entries(O.byPath)) {
    if (!p.startsWith(FI + cab + '/')) continue;
    for (const m of meshes) {
      const n = m.material && m.material.name || '';
      const slot = /^M_FillSide_/.test(n) ? 'side' : /^M_FillPanel_/.test(n) ? 'panel' : /^M_FillMarq_/.test(n) ? 'marquee' : /^M_FillMarqGlow_/.test(n) ? 'glow' : null;
      if (!slot) continue;
      const mat = m.material.clone();
      const t = art(game, slot === 'glow' ? 'marquee' : slot);
      if (slot === 'glow') { mat.emissiveMap = t; mat.emissive.setRGB(1, 1, 1); mat.emissiveIntensity = Math.max(1.2, mat.emissiveIntensity); if (mat.map) mat.map = t; }
      else { mat.map = t; if (slot === 'marquee') { mat.emissiveMap = t; mat.emissive.setRGB(1, 1, 1); mat.emissiveIntensity = 0.9; } }
      // the kit's UVs were laid out for the Unity textures (flipped to glTF's top-left origin at build time)
      t.flipY = false;
      mat.needsUpdate = true; m.material = mat;
    }
  }
}

// where the screen is, which way it faces (away from the cabinet body), where to stand and where the eye goes
export function cabinetPose(O, cab) {
  const scr = O.screens[FI + cab + '/Screen'];
  if (!scr) return null;
  const body = new THREE.Box3();
  for (const [p, meshes] of Object.entries(O.byPath)) if (p.startsWith(FI + cab + '/') && !/\/Screen$/.test(p)) for (const m of meshes) {
    const g = m.geometry; if (!g.boundingBox) g.computeBoundingBox();
    body.union(g.boundingBox.clone().applyMatrix4(m.matrix));
  }
  const sit = SIT.has(cab);
  // an upright's screen faces away from its body; a sit-down's faces back over its own seat, toward the body's middle
  const n = scr.normal.clone().setY(0).normalize();
  const away = !body.isEmpty() && n.dot(scr.center.clone().sub(body.getCenter(new THREE.Vector3())).setY(0)) >= 0;
  if (!body.isEmpty() && (sit ? away : !away)) n.negate();
  const floorY = body.isEmpty() ? scr.center.y - 1.3 : body.min.y;
  const stand = scr.center.clone().addScaledVector(n, sit ? 0.95 : 0.8); stand.y = floorY + 1.0;
  const eye = scr.center.clone().addScaledVector(n, sit ? 0.8 : 0.6); if (sit) eye.y -= 0.04;
  return { screen: scr, normal: n, stand, eye, target: scr.center.clone(), sit, floorY };
}

// THE JUNCTION's wall clock (CANON: every clock in the game reads 3:33, always). A lighted face, the kind that hung over an
// arcade's counter: it reads across the room and holds when the lights dip (THE ARCADE ANSWERS, js/answer.js). It hangs on
// the back wall over the lit arch, where the cabinet with no name will stand. No name on the dial. The hands stand where the
// basement's do: 3:33:50.
export const CLOCK = { center: [82, -32.95, -178.9], radius: 0.31, depth: 0.06, glow: 0.42 };
export function addJunctionClock(parent) {
  const R = CLOCK.radius, D = CLOCK.depth;
  const g = new THREE.Group(); g.name = 'JunctionClock';
  g.position.set(CLOCK.center[0], CLOCK.center[1], CLOCK.center[2]);
  // the dial, drawn once: cream, minute ticks, hour bars, plain numerals
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const x = c.getContext('2d'), M = 256;
  x.fillStyle = '#f1e8d2'; x.beginPath(); x.arc(M, M, 252, 0, Math.PI * 2); x.fill();
  x.strokeStyle = '#2a2622'; x.lineWidth = 6; x.beginPath(); x.arc(M, M, 236, 0, Math.PI * 2); x.stroke();
  for (let i = 0; i < 60; i++) {
    const a = i / 60 * Math.PI * 2, hour = i % 5 === 0, r0 = hour ? 196 : 214, r1 = 228;
    x.lineWidth = hour ? 11 : 3.5; x.strokeStyle = '#1c1916';
    x.beginPath(); x.moveTo(M + Math.sin(a) * r0, M - Math.cos(a) * r0); x.lineTo(M + Math.sin(a) * r1, M - Math.cos(a) * r1); x.stroke();
  }
  x.fillStyle = '#1c1916'; x.font = 'bold 50px "Helvetica Neue", Helvetica, Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  for (let h = 1; h <= 12; h++) { const a = h / 12 * Math.PI * 2; x.fillText(String(h), M + Math.sin(a) * 158, M - Math.cos(a) * 158 + 2); }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const face = new THREE.Mesh(new THREE.CircleGeometry(R * 0.93, 64),
    new THREE.MeshStandardMaterial({ name: 'M_JunctionClockFace', map: tex, emissiveMap: tex, emissive: 0xfff2dc, emissiveIntensity: CLOCK.glow, roughness: 0.85, metalness: 0 }));
  face.position.z = D - 0.012; g.add(face);
  // the case: a black rim and its back (a plastic shell, not metal: no lightmap here, a metal would go black)
  const caseMat = new THREE.MeshStandardMaterial({ name: 'M_JunctionClockCase', color: 0x16130f, roughness: 0.42, metalness: 0 });
  const rim = new THREE.Mesh(new THREE.TorusGeometry(R * 0.965, R * 0.05, 12, 64), caseMat); rim.position.z = D - 0.01; g.add(rim);
  const back = new THREE.Mesh(new THREE.CylinderGeometry(R, R, D - 0.012, 48, 1, true), caseMat); back.rotation.x = Math.PI / 2; back.position.z = (D - 0.012) / 2; g.add(back);
  // the hands: hour and minute black, the second red (angles clockwise from 12)
  const black = new THREE.MeshStandardMaterial({ name: 'M_JunctionClockHand', color: 0x0c0b0a, roughness: 0.6, metalness: 0 });
  const red = new THREE.MeshStandardMaterial({ name: 'M_JunctionClockSecond', color: 0xb00c12, roughness: 0.6, metalness: 0 });
  const hand = (mat, len, tail, w, z, deg) => {
    const s = new THREE.Shape(); s.moveTo(-w / 2, -tail); s.lineTo(w / 2, -tail); s.lineTo(w * 0.32, len * 0.9); s.lineTo(0, len); s.lineTo(-w * 0.32, len * 0.9); s.closePath();
    const m = new THREE.Mesh(new THREE.ShapeGeometry(s), mat); m.position.z = D - 0.012 + z; m.rotation.z = -deg * Math.PI / 180; return m;
  };
  g.add(hand(black, R * 0.52, R * 0.12, R * 0.085, 0.002, 3 * 30 + 33 * 0.5), hand(black, R * 0.8, R * 0.15, R * 0.055, 0.004, 33 * 6), hand(red, R * 0.86, R * 0.22, R * 0.018, 0.006, 50 * 6));
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.045, R * 0.045, 0.006, 20), red); cap.rotation.x = Math.PI / 2; cap.position.z = D - 0.012 + 0.008; g.add(cap);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
  parent.add(g);
  return g;
}
