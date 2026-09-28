// Flynn's floor (his ruling 2026-09-26): every cabinet in the arcade runs its own playable game, no repeats.
// Our three stand at the front left (main.js wires them); the 21 uprights and the 2 sit-downs are listed here with
// the game each one runs. Each cabinet wears its game's art (side panels, control panel, lit marquee: the art packs
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
