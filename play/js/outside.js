// World 1 outdoors, rebuilt from the Unity scene dump (tools/build_outside.mjs): the areaway, the yard at dusk,
// the hill road through the trees, the town, main street and Flynn's. Repeated meshes are GPU-instanced;
// the rest merges by material and by 40 m cell so what is behind you is culled. The sky, the dusk and the
// street lamps follow DuskProgression / ExteriorAtmosphere / LampBuzzOn; the body is a capsule against a BVH
// of Unity's own colliders, and the bike follows BikeController's numbers.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MeshBVH } from 'three-mesh-bvh';
import { makeCRTMaterial } from './crt.js';

const DEG = Math.PI / 180;
const LM_RANGE = 4;
const srgb = (c) => new THREE.Color().setRGB(c[0], c[1], c[2], THREE.SRGBColorSpace);
const lerpC = (a, b, t) => [0, 1, 2].map((i) => a[i] + (b[i] - a[i]) * t);
const lerp = (a, b, t) => a + (b - a) * t;
// what stays a live object instead of being merged: things that move, light up or get swapped
// (the floor cabinets too: each wears its own game's art, so they cannot share instanced materials)
const DYNAMIC = /^Outside\/Bike(\/|$)|^Outside\/Flynns\/FlynnsArchGlass\/FlynnDoor[LR]|^Outside\/Flynns\/FlynnsInterior\/PolybiusSpot|^Outside\/MainStreet\/LampHead_|^Outside\/Flynns\/FlynnsInterior\/FFiller(Sit)?_\d+\//;
const POOL = 16;                 // point lights live at once; the nearest, strongest ones get them

// ---- the web version's own Flynn's (his ruling 2026-09-26). The nook straight ahead starts EMPTY (only the cord and
// the clean rectangle on the lino) and is where the cabinet with no name is delivered; the two sit-down racers move
// out of the unreachable back-left corner to the open floor on your right as you walk in. Unity is left as it is.
const FI = 'Outside/Flynns/FlynnsInterior/';
const LAYOUT = [
  { prefix: FI + 'FFiller_niche', remove: true },
  { prefix: FI + 'PolybiusSpot', from: [84.6, -36.99, -178.5], to: [82, -36.99, -179.8], yaw: 0 },
  { prefix: FI + 'FFillerSit_0', from: [74.8, -36.99, -178.4], to: [89.2, -36.99, -170.8], yaw: -90 },
  { prefix: FI + 'FFillerSit_1', from: [76.6, -36.99, -178.4], to: [89.2, -36.99, -172.6], yaw: -90 },
  // the office upstairs (assets/flynns_env/flynns_office.glb) stands where Unity's placeholder blinds hung in mid air
  { prefix: FI + 'Blinds_0', remove: true }, { prefix: FI + 'Blinds_1', remove: true }, { prefix: FI + 'Blinds_2', remove: true },
];
for (const e of LAYOUT) if (!e.remove) {
  e.M = new THREE.Matrix4().makeTranslation(...e.to).multiply(new THREE.Matrix4().makeRotationY(e.yaw * DEG)).multiply(new THREE.Matrix4().makeTranslation(-e.from[0], -e.from[1], -e.from[2]));
  e.q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), e.yaw * DEG);
}
const editFor = (p) => (p ? LAYOUT.find((e) => p === e.prefix || p.startsWith(e.prefix + '/')) : null);

// ---- Flynn's environment pass (blender/flynns/flynns_env.py -> tools/build_flynns_env.mjs -> assets/flynns_env/): the
// shell, the fixtures, the mezzanine, the arches and the doors re-surfaced, and the room baked at night in Cycles. A baked
// surface draws albedo x lightmap and nothing else (MeshBasicMaterial): the bake already holds every light in the room,
// the cabinets' screens and marquees included, so no web light may land on it a second time (and 16 point lights a pixel
// fewer). The old shell nodes still give the collision (same vertices, new UVs); they are just not drawn. The room's own
// lights go off; a small rig placed from the bake (flynnsRig) lights what is not baked: the cabinets, the props, the men.
// THE OFFICE (2026-09-27, blender/flynns/junction_office.py): the hall's ceiling is 6.4 m now, the balcony 4.75 m deep, the
// stair turns onto a corner landing, and the office stands on the balcony (flynns_office.glb: baked on a fourth lightmap;
// its props share one palette material). The old mezzanine's collider goes; flynns_office_collision.glb takes its place
// (boxes, and a ramp through the stair's nosings, since a capsule cannot climb 1/6 m risers).
const ENV = 'assets/flynns_env/';
// THE JUNCTION's sign (his pick 2026-09-26; blender/junction_sign/junction_sign.py): built in place in the outside's own
// coordinates, it replaces the old sign and box, and the light that washes the brick moves down to the new sign's body
const SIGN = 'assets/junction/junction_sign.glb';
const OLD_SIGN = /^Outside\/Flynns\/FlynnSign(Box)?$/;
const SIGN_LIGHT = { name: 'FlynnSignLight', pos: [82, -31.3, -164.9], color: [1, 0.3, 0.16], intensity: 6.5, range: 34 };
// the approved JUNCTION art in the old FLYNN'S poster slots (the tournament poster and the window poster never named it)
const RETEX = { M_FlynnPosterG: 'junction/poster_birthday_parties.jpg', M_FlynnRules: 'junction/poster_house_rules.jpg' };
const ENV_TUNE = { lm: 1.2, amb: 0.8, sheen: 3, ambCol: [1, 0.78, 0.6], fx: { M_Env_BulbAmber: 0.16, M_Env_NeonRed: 0.3, M_Env_NeonBlue: 0.3,
  M_Env_PendantGlow: 0.3, M_Office_GlowWarm: 0.35, M_Office_LampGreen: 1, M_Office_Screen: 0.7, fixture: 1 } };
// The renders were graded AgX at +1.8 EV; the web grades ACES (js/post.js), which sits far deeper in the shadows. On the
// grey axis, what AgX shows for a scene value x the web shows for ~0.96 x^0.69 (5x at 0.005, 2x at 0.1, 1x at 1), so the
// baked surfaces carry that curve themselves and the rest of the game keeps its grade.
const ENV_CURVE = { envK: { value: 0.96 }, envG: { value: 0.75 } };      // 0.69 by the numbers; 0.75 + lm 1.2 matched the renders closer
function withBakeCurve(m) {
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, ENV_CURVE);
    s.fragmentShader = 'uniform float envK, envG;\n' + s.fragmentShader.replace('vec3 outgoingLight = reflectedLight.indirectDiffuse;',
      'vec3 outgoingLight = envK * pow( max( reflectedLight.indirectDiffuse, vec3( 0.0 ) ), vec3( envG ) );');
  };
  return m;
}
// THE OFFICE LAMP (js/answer.js: the third knock). The office upstairs starts DARK, nobody home, its terminal still on; its
// lamp clicks on with the third knock (today: Starvector's last wave). The office was baked with every lamp lit, so 'off' is that bake
// scaled down inside the room's box only (the stair, the balcony and the landing's sconce outside it keep their light), and
// its lamps' glass goes dim with it. W.officeLamp(k): 0 off .. 1 on (the bake as it was).
const OFFICE_LAMP = { lamp: { value: 0 }, dark: { value: 0.035 } };
const OFFICE_BOX = { lo: [85.44, -34.05, -175.08], hi: [90.1, -30.9, -168.92] };      // the office's inside faces, web x y z
const OFFICE_KEEP = /^M_Office_(Screen|Glass)$/;                                        // the terminal stays on; the glass is unbaked
function withOfficeLamp(m, glow) {
  const prev = m.onBeforeCompile, v = (a) => `vec3( ${a.map((x) => x.toFixed(3)).join(', ')} )`;
  m.onBeforeCompile = (s, r) => {
    if (prev) prev.call(m, s, r);
    s.uniforms.officeLamp = OFFICE_LAMP.lamp; s.uniforms.officeDark = OFFICE_LAMP.dark;
    s.vertexShader = 'varying vec3 vOfficeW;\n' + s.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n\tvOfficeW = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;');
    s.fragmentShader = 'uniform float officeLamp, officeDark;\nvarying vec3 vOfficeW;\n' + s.fragmentShader.replace('#include <opaque_fragment>', `{
		vec3 oIn3 = step( ${v(OFFICE_BOX.lo)}, vOfficeW ) * step( vOfficeW, ${v(OFFICE_BOX.hi)} );
		outgoingLight *= mix( 1.0, officeDark * ${glow ? '0.25' : '1.0'}, oIn3.x * oIn3.y * oIn3.z * ( 1.0 - officeLamp ) );
	}
	#include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => 'officeLamp|' + (glow ? 'glow' : prev ? 'baked' : 'plain');
  return m;
}
// The lino's gloss, cheaply: one small HDR cube of the room, taken once when you first walk in (W.captureSheen), read back
// box-projected (so a bulb's reflection sits under the bulb, not under the cube's centre), softened by a mip level and
// four taps spread in the plane of incidence (a glossy floor stretches a light into a streak toward you, not a round
// blob), weighted by Fresnel, and kept out of the dark under the cabinets by the lightmap itself. Four texture fetches a
// floor pixel; no screen-space pass, no mirror camera.
const SHEEN = {
  pos: new THREE.Vector3(82, -35.2, -173.5), size: 128,
  u: { sheenCube: { value: null }, sheen: { value: 0 }, sheenLod: { value: 2.0 }, sheenStretch: { value: 0.06 },
    sheenPos: { value: new THREE.Vector3(82, -35.2, -173.5) }, sheenMin: { value: new THREE.Vector3(73.7, -36.99, -179.2) }, sheenMax: { value: new THREE.Vector3(90.3, -30.59, -167.7) } },
};
function withFloorSheen(m) {
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, ENV_CURVE, SHEEN.u);
    s.vertexShader = 'varying vec3 vSheenW;\n' + s.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n\tvSheenW = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;');
    s.fragmentShader = 'uniform float envK, envG, sheen, sheenLod, sheenStretch;\nuniform samplerCube sheenCube;\nuniform vec3 sheenPos, sheenMin, sheenMax;\nvarying vec3 vSheenW;\n' +
      s.fragmentShader.replace('vec3 outgoingLight = reflectedLight.indirectDiffuse;', `vec3 outgoingLight = envK * pow( max( reflectedLight.indirectDiffuse, vec3( 0.0 ) ), vec3( envG ) );
	vec3 sheenV = normalize( vSheenW - cameraPosition ), sheenR = reflect( sheenV, vec3( 0.0, 1.0, 0.0 ) ), sheenAcc = vec3( 0.0 );
	for ( int i = 0; i < 4; i ++ ) {
		vec3 r = normalize( vec3( sheenR.x, max( 0.01, sheenR.y + ( float( i ) - 1.5 ) * sheenStretch ), sheenR.z ) );
		vec3 t = max( ( sheenMax - vSheenW ) / r, ( sheenMin - vSheenW ) / r );
		sheenAcc += textureLod( sheenCube, vSheenW + r * min( min( t.x, t.y ), t.z ) - sheenPos, sheenLod ).rgb;
	}
	float sheenF = 0.04 + 0.96 * pow( 1.0 - clamp( -sheenV.y, 0.0, 1.0 ), 5.0 );
	float sheenOcc = smoothstep( 0.0, 0.012, dot( lightMapTexel.rgb, vec3( 0.3333 ) ) );
	outgoingLight += sheen * 0.25 * sheenF * sheenOcc * sheenAcc;`);
  };
  return m;
}
const FLYNNS_BAKED_LIGHTS = /^(FlynnCeilLight_\d+|FlynnFill_\d+|FlynnBackGlow|FCabGlow_\w+|FlynnVestLight|FlynnScoreSpot)$/;
// the window spills lit the room and the sidewalk; the room is baked now, so they step outside the glass and only reach
// the sidewalk, the bikes and the storefront
const FLYNNS_SPILL = /^ArchSpill_\d+$/, SPILL_Z = -166.9, SPILL_RANGE = 5;
// faces that never face the room (the storefront's street face, wall tops, faces against a wall) point every corner at one
// black texel of their atlas: they are drawn apart, lit by the street like before
const HIDDEN_TEXEL = [1 - 5 / 2048, 5 / 2048];
const isHiddenUV = (uv, i) => Math.abs(uv.getX(i) - HIDDEN_TEXEL[0]) < 2e-4 && Math.abs(uv.getY(i) - HIDDEN_TEXEL[1]) < 2e-4;
// the inside of Flynn's (web x, z): past the doors the street's moonlight stays outside and the ambient becomes the room's
// own warm bounce (ENV_TUNE.amb, .ambCol): what Cycles gave the props by path tracing, the web gives them flat
const FLYNNS_IN = { x0: 72.2, x1: 91.8, z0: -182, z1: -166.6, ramp: 1.5 };
async function loadFlynnsEnv(loader, anisotropy) {
  const bitmaps = typeof createImageBitmap !== 'undefined' && !/^((?!chrome|android).)*safari/i.test(navigator.userAgent);
  const tl = bitmaps ? new THREE.ImageBitmapLoader() : new THREE.TextureLoader();
  const lm = (k) => new Promise((res, rej) => tl.load(ENV + `lm_${k}.webp`, (img) => {
    const t = img.isTexture ? img : new THREE.Texture(img);
    // sRGB(irradiance / 4), on the second UV set, never repeated, no mips (they would bleed the empty atlas into the charts)
    t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; t.channel = 1;
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.generateMipmaps = false; t.minFilter = THREE.LinearFilter;
    t.needsUpdate = true; res(t);
  }, undefined, rej));
  const opt = (f) => loader.loadAsync(ENV + f).catch((e) => { console.error('[flynns env] ' + f, e); return null; });
  const [env, fx, office, col, ...lightmaps] = await Promise.all([loader.loadAsync(ENV + 'flynns_env.glb'), loader.loadAsync(ENV + 'flynns_env_fx.glb'),
    opt('flynns_office.glb'), opt('flynns_office_collision.glb'), lm(0), lm(1), lm(2), lm(3)]);
  for (const g of [env, office]) if (g) g.scene.traverse((o) => { if (o.isMesh && o.material.map) o.material.map.anisotropy = anisotropy; });
  const paths = new Set();
  env.scene.traverse((n) => { if (n.userData && n.userData.path) paths.add(n.userData.path); });
  return { env: env.scene, fx: fx.scene, office: office && office.scene, col: col && col.scene, lightmaps, paths };
}
// the environment's meshes: baked ones merged per material, the doors kept live (they swing), the glowing pieces unlit
function buildFlynnsEnv(E, group, byPath) {
  const mats = new Map(), buckets = new Map(), tuned = [];
  SHEEN.rt = new THREE.WebGLCubeRenderTarget(SHEEN.size, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
  SHEEN.u.sheenCube.value = SHEEN.rt.texture;
  const glow = (src, gain) => {
    const m = new THREE.MeshBasicMaterial({ name: src.name, map: src.emissiveMap || null });
    m.userData.glow = { col: src.emissive.clone().multiplyScalar(src.emissiveIntensity), gain };
    m.color.copy(m.userData.glow.col).multiplyScalar(gain); tuned.push(m); return m;
  };
  const convert = (src, lm) => {
    const key = /FixtureOn/.test(src.name) ? 'FixtureOn' : src.uuid + '|' + lm;     // the two lit fixtures: one draw
    if (mats.has(key)) return mats.get(key);
    let m;
    const lit = src.emissive && src.emissiveIntensity > 0 && src.emissive.getHex() !== 0;
    if (lit) m = glow(src, ENV_TUNE.fx[src.name] ?? (/FixtureOn/.test(src.name) ? ENV_TUNE.fx.fixture : 1));
    else if (lm !== null && lm !== undefined) {
      const base = new THREE.MeshBasicMaterial({ name: src.name, color: src.color, map: src.map, lightMap: E.lightmaps[lm], lightMapIntensity: Math.PI * 4 * ENV_TUNE.lm });
      m = /Lino/.test(src.name) ? withFloorSheen(base) : withBakeCurve(base);
      m.userData.sheen = /Lino/.test(src.name);
      tuned.push(m);
    } else if (/Wire/.test(src.name)) m = new THREE.MeshBasicMaterial({ name: src.name, color: src.color });
    else {
      // the doors' frames and the glass: not baked, lit by the street like the rest of the storefront
      m = src; m.metalness = Math.min(m.metalness, 0.3);
      if (m.transparent) m.depthWrite = false;
      else m.side = THREE.FrontSide;
    }
    if (m.isMeshBasicMaterial && !m.transparent) m.side = THREE.FrontSide;
    if (/^M_Office_/.test(src.name) && !OFFICE_KEEP.test(src.name) && m.isMeshBasicMaterial) withOfficeLamp(m, lit);
    mats.set(key, m); return m;
  };
  const outside = new Map();
  const outsideMat = (src) => {
    if (!outside.has(src.uuid)) outside.set(src.uuid, new THREE.MeshStandardMaterial({ name: src.name + '_Street', color: src.color, map: src.map, roughness: 0.9, metalness: 0 }));
    return outside.get(src.uuid);
  };
  let calls = 0;
  for (const scene of [E.env, E.fx, E.office]) {
    if (!scene) continue;
    scene.updateMatrixWorld(true);
    scene.traverse((n) => {
      const path = n.userData && n.userData.path; if (!path) return;
      const meshes = n.isMesh ? [n] : n.children.filter((c) => c.isMesh);
      for (const o of meshes) {
        const mat = convert(o.material, n.userData.lm);
        if (DYNAMIC.test(path)) {
          const mesh = new THREE.Mesh(o.geometry, mat); mesh.matrixAutoUpdate = false; mesh.matrix.copy(o.matrixWorld); mesh.name = path;
          group.add(mesh); (byPath[path] = byPath[path] || []).push(mesh); calls++;
          continue;
        }
        const g = toWorld(o.geometry, o.matrixWorld);
        const parts = mat.lightMap ? splitHidden(g) : [g, null];
        // the walls' black-texel faces include the storefront's street face: lit by the street. The floor's and the
        // mezzanine's lie against walls and are never seen: not drawn
        const lit = parts[1] && /\/Flynns_Walls$/.test(path) && outsideMat(o.material);
        for (const [m, part] of [[mat, parts[0]], [lit, parts[1]]]) if (m && part) {
          if (!buckets.has(m)) buckets.set(m, []);
          buckets.get(m).push(part);
        }
      }
    });
  }
  const boxes = {};
  for (const [mat, geos] of buckets) {
    const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, mat); mesh.matrixAutoUpdate = false; mesh.name = 'FlynnsEnv/' + mat.name;
    if (mat.transparent) mesh.renderOrder = 1;
    if (mat.userData.sheen) SHEEN.floor = mesh;
    group.add(mesh); calls++;
  }
  // where the glowing pieces are (the rig below is placed from them)
  E.fx.traverse((n) => { if (n.userData && n.userData.path) boxes[n.userData.path.split('/').pop()] = new THREE.Box3().setFromObject(n); });
  return { calls, tuned, boxes };
}
// a baked geometry -> [the faces the bake lights, the faces pointed at the black texel] (same vertices, two index lists)
function splitHidden(g) {
  const uv = g.attributes.uv1, idx = g.index.array, room = [], street = [];
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t], b = idx[t + 1], c = idx[t + 2];
    (isHiddenUV(uv, a) && isHiddenUV(uv, b) && isHiddenUV(uv, c) ? street : room).push(a, b, c);
  }
  const sub = (list) => { if (!list.length) return null; const o = new THREE.BufferGeometry();
    for (const [k, v] of Object.entries(g.attributes)) o.setAttribute(k, v); o.setIndex(list); return o; };
  return [sub(room), sub(street)];
}
// a handful of point lights for what the bake cannot hold (the cabinets, the props, the men, the delivered cabinet),
// placed where the bake's own sources are; they go into the pool like any other light (the pool size never changes)
function flynnsRig(boxes) {
  const c = (n, dx = 0, dy = 0, dz = 0) => boxes[n] ? boxes[n].getCenter(new THREE.Vector3()).add(new THREE.Vector3(dx, dy, dz)) : null;
  const L = (name, pos, col, intensity, range) => pos && ({ name, pos, color: new THREE.Color().setRGB(col[0], col[1], col[2], THREE.SRGBColorSpace), range, base: intensity, intensity, on: true });
  return [
    L('EnvFixture_4', new THREE.Vector3(80.5, -33.0, -174.1), [1, 0.8, 0.58], 1.6, 9),
    L('EnvFixture_8', new THREE.Vector3(85, -33.0, -178.3), [1, 0.8, 0.58], 1.6, 9),
    L('EnvVestibule', new THREE.Vector3(82, -34.5, -168.9), [1, 0.78, 0.6], 1.0, 4),
    L('EnvPendant_0', new THREE.Vector3(84.25, -33.72, -170.6), [1, 0.64, 0.34], 1.0, 5),
    L('EnvPendant_1', new THREE.Vector3(84.25, -33.72, -172.6), [1, 0.64, 0.34], 1.0, 5),
    L('EnvPendant_2', new THREE.Vector3(84.25, -33.72, -174.6), [1, 0.64, 0.34], 1.0, 5),
    L('EnvArchBulbs', c('ArchBulbs', 0, -0.4, 0.8), [1, 0.62, 0.3], 1.6, 7),
    L('EnvStairBulbs', c('StairBulbs', -0.6, 0, 0), [1, 0.62, 0.3], 0.9, 6),
    L('EnvNeonRed', c('NeonPlanet', 0, -0.3, 0.7), [1, 0.1, 0.16], 0.7, 5),
    L('EnvNeonBlue', c('NeonRocket', 0, -0.3, 0.7), [0.3, 0.5, 1], 0.7, 5),
    L('EnvNook', new THREE.Vector3(82, -34.6, -179.0), [0.22, 0.42, 1], 0.5, 4),
    L('EnvLounge', new THREE.Vector3(88.3, -34.55, -169.6), [1, 0.6, 0.3], 1.2, 6),
  ].filter(Boolean);
}
const HIDDEN_UNTIL_DELIVERY = /PolybiusSpot\/Visual(\/|$)/;    // Unity's PolybiusCabinet hides it at runtime; the export saw it on
function applyLayout(meta) {
  const P = (a, e) => new THREE.Vector3(...a).applyMatrix4(e.M).toArray();
  const D = (a, e) => new THREE.Vector3(...a).applyQuaternion(e.q).toArray();
  for (const o of meta.objects) { const e = editFor(o.path); if (!e || e.remove) continue;
    o.pos = P(o.pos, e); o.fwd = D(o.fwd, e); o.rot = e.q.clone().multiply(new THREE.Quaternion(...o.rot)).toArray(); }
  for (const c of meta.components) { const e = editFor(c.path); if (e && !e.remove) c.pos = P(c.pos, e); }
  meta.lights = meta.lights.filter((l) => !(editFor(l.path) || {}).remove);
  for (const l of meta.lights) { const e = editFor(l.path); if (e) { l.pos = P(l.pos, e); l.dir = D(l.dir, e); } }
  meta.colliders = meta.colliders.filter((c) => !(editFor(c.path) || {}).remove);
  for (const c of meta.colliders) { const e = editFor(c.path); if (!e) continue;
    if (c.c) c.c = P(c.c, e);
    for (const k of ['ax', 'ay', 'az', 'axis']) if (c[k]) c[k] = D(c[k], e); }
}

// ---- Stage 1: the ride's readability (2026-09-27, docs/WORLD1_WEB_POLISH_PLAN_2026-09-26.md). Moody, not murky: dusk
// turning to night on the way down stays the point, so all of it rides the descent (W.k) and the top of the hill is left
// as it was. The sun sets into a cold moon that carves the hill; the sky gets the moon, stars and a navy the trees
// read against; the asphalt stops being coal-black so the lamp pools land on it; the hill road gets painted edges; the
// town's lights come on in layers as you come down (the houses' backs, the blocks, their streetlights, the far edge of
// town); the houses' bare sides get siding; one lamp stands at the bend (storyboard frame 04). No light is added: the
// moon is the sun, and the bend's lamp joins the pool like the street's.
const NIGHT = {
  moonDir: new THREE.Vector3(-0.47, 0.34, -0.81).normalize(),    // where the moon hangs: up and left of the view down the valley
  moonLight: new THREE.Vector3(-0.383, 0.643, -0.663).normalize(), // where its light comes from: the same bearing, higher, so the
                            // street's facades are not lit like day and the ground takes the light that shapes the hill
  moon: 0.8,                // the moon's strength at full night (Unity's night sun: 0.1, played at 0.25)
  moonStreet: 0.45,         // ... and down in the street, where the lamps and the windows take over (it eases in below the hill)
  ambient: 1.3,             // the flat fill at night (was 2.2): less of it, so the moon gives the hill its shape
  sky: 1.0,                 // the night sky's exposure (Unity's 0.26 left it black: the trees had nothing to stand against)
  fog: 1.9,                 // the night fog lifted toward the moonlit horizon, so distance reads as haze, not as black
  asphalt: 0.05,            // the asphalt's albedo at night (0.008 is darker than coal: no lamp pool could land on it)
  lampReach: 14,            // a street lamp buzzes on this far ahead of you (Unity: 6 m, i.e. once you were under it)
  lampGain: 1.3,            // and burns brighter than Unity's 9.5, so its pool lands on the road under the moon
  hillLamps: [{ at: [39.6, -90.0], arm: [-1, 0.03], scale: 1.2 }],      // the lamp at the bend: post (x, z), where its arm reaches, size
                            // (coming into the bend THE JUNCTION's sign is dead ahead: the post stands ~7 deg right of it)
  siding: [0.084, 0.119, 0.162],                                  // the house facades' blue-grey (o13), linear
};
const LAMP_SRC = { post: 'Outside/MainStreet/Streetlamp_1/SM_NL_Streetlamp', head: 'Outside/MainStreet/LampHead_1', base: [8.6, -37.0, -155.4], arm: [0, -1], light: 'Streetlamp_1_Light' };
const HOUSE_BOX = /^Outside\/MainStreet\/House_\d$/;
const smooth01 = (x) => { const s = Math.min(1, Math.max(0, x)); return s * s * (3 - 2 * s); };
let _seed = 1;
const rnd = () => (_seed = (_seed * 16807) % 2147483647) / 2147483647;
// the hill road's own asphalt, with its edge lines painted in (its u runs 0..1 across the 5 m width)
function hillRoadMaterial(src) {
  const m = src.clone(); m.name = 'M_Asphalt_HillRoad'; m.userData.edgeK = { value: 0 };   // edgeK: the paint shows as the dusk goes
  m.onBeforeCompile = (s) => {
    s.uniforms.edgeCol = { value: new THREE.Color().setRGB(0.34, 0.32, 0.23) };      // M_RoadLine
    s.uniforms.edgeK = m.userData.edgeK;
    s.vertexShader = 'varying float vRoadU;\n' + s.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\n\tvRoadU = uv.x;');
    s.fragmentShader = 'uniform vec3 edgeCol;\nuniform float edgeK;\nvarying float vRoadU;\n' + s.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
	float eu = min( vRoadU, 1.0 - vRoadU ), ew = max( fwidth( eu ), 1e-5 );
	float edge = ( smoothstep( 0.024 - ew, 0.024 + ew, eu ) - smoothstep( 0.05 - ew, 0.05 + ew, eu ) ) * clamp( 0.02 / ew, 0.0, 1.0 ) * edgeK;
	diffuseColor.rgb = mix( diffuseColor.rgb, edgeCol, edge );`);
  };
  m.customProgramCacheKey = () => 'hillRoadEdges';
  return m;
}
// the houses' sides and backs (Unity left them one flat cream): painted clapboard in the facades' blue-grey
function sidingMaterial(anisotropy) {
  const c = document.createElement('canvas'); c.width = 32; c.height = 256; const g = c.getContext('2d');
  for (let i = 0; i < 16; i++) {
    const y = i * 16, grd = g.createLinearGradient(0, y, 0, y + 16);
    grd.addColorStop(0, '#f2f2f2'); grd.addColorStop(0.8, '#d2d2d2'); grd.addColorStop(0.82, '#6e6e6e'); grd.addColorStop(1, '#8c8c8c');
    g.fillStyle = grd; g.fillRect(0, y, 32, 16);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1, 2.5); t.anisotropy = anisotropy;
  const m = new THREE.MeshStandardMaterial({ name: 'M_HouseSiding', map: t, roughness: 0.8, metalness: 0 });
  m.color.setRGB(NIGHT.siding[0], NIGHT.siding[1], NIGHT.siding[2], THREE.LinearSRGBColorSpace);
  return m;
}
// a lit window seen from outside: trim, glass brighter low in the room, mullions, curtains at the sides
function windowTexture() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 96; const g = c.getContext('2d');
  g.fillStyle = '#1c1916'; g.fillRect(0, 0, 64, 96);
  const grd = g.createRadialGradient(32, 70, 6, 32, 56, 64); grd.addColorStop(0, '#ffffff'); grd.addColorStop(1, '#9a9a9a');
  g.fillStyle = grd; g.fillRect(5, 5, 54, 86);
  g.fillStyle = 'rgba(60,40,25,0.6)'; g.fillRect(5, 5, 10, 86); g.fillRect(49, 5, 10, 86);
  g.fillStyle = '#1c1916'; g.fillRect(30, 5, 4, 86); g.fillRect(5, 44, 54, 4);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
// the town's lights, in layers from near to far: windows on the houses' backs and sides and on the blocks' dark floors and
// sides (one instanced draw), and the blocks' streetlights and the far edge of town (another). They fade in with the night.
function buildTownLights(objects, bvh) {
  _seed = 1982;
  const wins = [], dots = [];
  const warm = (g = 1) => { const k = (0.8 + rnd() * 0.8) * g; return rnd() < 0.1 ? [0.42 * k, 0.55 * k, 1.0 * k] : [k, (0.56 + rnd() * 0.12) * k, (0.24 + rnd() * 0.1) * k]; };
  const win = (x, y, z, nx, nz, w, h) => wins.push({ p: [x + nx * 0.1, y, z + nz * 0.1], yaw: Math.atan2(nx, nz), s: [w, h, 1], col: warm() });
  const dot = (x, y, z, s, col) => dots.push({ p: [x, y, z], yaw: 0, s, col });
  for (let i = 0; i < 4; i++) {                              // the houses on main street: their backs and sides face the hill
    const o = objects.get('Outside/MainStreet/House_' + i); if (!o) continue;
    const [cx, cy, cz] = o.pos, [sx, sy, sz] = o.scale, y0 = cy - sy / 2;
    for (const fy of [2.3, 5.5]) {
      for (const dx of [-2.5, 0, 2.5]) if (rnd() < 0.55) win(cx + dx, y0 + fy, cz + sz / 2, 0, 1, 0.9, 1.3);
      for (const side of [-1, 1]) for (const dz of [-2.2, 2.2]) if (rnd() < 0.4) win(cx + side * sx / 2, y0 + fy, cz + dz, side, 0, 0.9, 1.3);
    }
  }
  for (let i = 0; i <= 10; i++) {                            // the blocks: the floors Unity left dark, the sides, a streetlight
    const o = objects.get('Outside/Town/Town_' + i); if (!o) continue;
    const [cx, cy, cz] = o.pos, [sx, sy, sz] = o.scale, y0 = cy - sy / 2;
    const rows = objects.has(`Outside/Town/TWin_${i}_1_0`) ? 2 : 1;
    for (let k = 0, fy = 1.9; fy + 0.75 < sy - 0.8; k++, fy += 3.4) {
      if (k >= rows) for (let c = 0; c < 4; c++) if (rnd() < 0.5) win(cx + (c - 1.5) * (sx - 3) / 3, y0 + fy, cz + sz / 2, 0, 1, 1.1, 1.5);
      const n = Math.max(1, Math.floor((sz - 2) / 3.2));
      for (const side of [-1, 1]) for (let j = 0; j < n; j++) if (rnd() < 0.45) win(cx + side * sx / 2, y0 + fy, cz + (j - (n - 1) / 2) * 3.2, side, 0, 1.1, 1.5);
    }
    dot(cx - sx / 2 - 1.3, y0 + 4.6, cz + sz / 2 + 1.3, [0.34, 0.16, 0.34], [3.4, 2.1, 0.9]);
  }
  const ray = new THREE.Ray(new THREE.Vector3(), new THREE.Vector3(0, -1, 0));
  const ground = (x, z) => { ray.origin.set(x, 40, z); const h = bvh.raycastFirst(ray, THREE.DoubleSide); return h ? h.point.y : -37.1; };
  for (const [x0, x1, z0, z1, n] of [[-100, 140, -305, -245, 34], [96, 145, -240, -150, 12], [-105, -76, -240, -150, 10]]) {
    for (let i = 0; i < n; i++) {                           // the far edge of town: a house's lit windows, now and then a streetlight
      const x = x0 + rnd() * (x1 - x0), z = z0 + rnd() * (z1 - z0), y = ground(x, z);
      if (rnd() < 0.25) { dot(x, y + 4.6, z, [0.28, 0.14, 0.28], [2.2, 1.35, 0.6]); continue; }
      const c = warm(0.75); dot(x, y + 1.3, z, [0.6, 0.55, 0.6], c);
      if (rnd() < 0.5) dot(x + 1.4, y + 1.3 + (rnd() < 0.5 ? 2.8 : 0), z, [0.6, 0.55, 0.6], c.map((v) => v * 0.8));
    }
  }
  const inst = (geo, mat, list, name) => {
    const im = new THREE.InstancedMesh(geo, mat, list.length); im.name = name;
    const M = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), c = new THREE.Color();
    list.forEach((w, i) => { im.setMatrixAt(i, M.compose(new THREE.Vector3(...w.p), q.setFromAxisAngle(up, w.yaw), new THREE.Vector3(...w.s))); im.setColorAt(i, c.setRGB(w.col[0], w.col[1], w.col[2], THREE.LinearSRGBColorSpace)); });
    im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true; im.computeBoundingSphere(); return im;
  };
  const winMat = new THREE.MeshBasicMaterial({ name: 'M_NightWindows', map: windowTexture(), color: 0x000000, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 });
  const dotMat = new THREE.MeshBasicMaterial({ name: 'M_NightLights', color: 0x000000, fog: false });
  return { mats: [winMat, dotMat], meshes: [inst(new THREE.PlaneGeometry(1, 1), winMat, wins, 'NightWindows'), inst(new THREE.BoxGeometry(1, 1, 1), dotMat, dots, 'NightLights')], count: wins.length + dots.length };
}

export async function loadOutside({ anisotropy = 8, lightmaps = [], onProgress } = {}) {
  const meta = await (await fetch('assets/outside.json')).json();
  applyLayout(meta);
  // THE JUNCTION's posters in the two old FLYNN'S slots (Stage 1; tools/make_junction_posters.py): paths with a folder load from assets/
  for (const m of meta.materials) if (RETEX[m.name]) m.map = RETEX[m.name];
  const comps = {};
  for (const c of meta.components) (comps[c.type] = comps[c.type] || []).push(c);
  const objects = new Map(meta.objects.map((o) => [o.path, o]));

  // ---- textures
  const files = new Set();
  for (const m of meta.materials) { if (m.map) files.add(m.map); if (m.emissiveMap) files.add(m.emissiveMap); if (m.crt && m.crt.tex) files.add(m.crt.tex); }
  const textures = {}; let texDone = 0, glbFrac = 0;
  const report = () => onProgress && onProgress(glbFrac * 0.6 + (texDone / Math.max(1, files.size)) * 0.4);
  const tl = new THREE.TextureLoader();
  const texP = Promise.all([...files].map((f) => new Promise((res) => tl.load((f.includes('/') ? 'assets/' : 'assets/tex_out/') + f, (t) => {
    t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = anisotropy;
    textures[f] = t; texDone++; report(); res();
  }, undefined, () => { texDone++; report(); res(); }))));
  const loader = new GLTFLoader();
  const wasm = await Promise.race([MeshoptDecoder.ready.then(() => true, () => false), new Promise((r) => setTimeout(() => r(false), 4000))]);
  if (wasm) loader.setMeshoptDecoder(MeshoptDecoder);
  // Flynn's environment pass loads alongside; if it cannot (or ?env=0 asks for the old shell), the old shell and its lights stay
  const envP = /[?&]env=0/.test(location.search) ? Promise.resolve(null) : loadFlynnsEnv(loader, anisotropy).catch((e) => { console.error('[flynns env]', e); return null; });
  const signP = loader.loadAsync(SIGN).catch((e) => { console.error('[junction sign]', e); return null; });
  const gltf = await new Promise((res, rej) => loader.load(wasm ? 'assets/outside.glb' : 'assets/outside_plain.glb', res,
    (e) => { if (e.total) { glbFrac = e.loaded / e.total; report(); } }, rej));
  glbFrac = 1; report();
  await texP;
  const E = await envP;
  const sign = await signP;
  const envPaths = E ? E.paths : new Set();

  // ---- materials (the basement's conversion; baked ones borrow the basement's lightmaps)
  const cache = new Map();
  function litMaterial(mi, lm) {
    const key = mi + '|' + lm;
    if (cache.has(key)) return cache.get(key);
    const m = meta.materials[mi];
    const mat = new THREE.MeshStandardMaterial({ name: m.name });
    mat.color.setRGB(m.color[0], m.color[1], m.color[2], THREE.LinearSRGBColorSpace);
    if (m.map && textures[m.map]) {
      const t = textures[m.map].clone(); const [sx, sy, ox, oy] = m.st;
      t.repeat.set(sx, sy); t.offset.set(ox, 1 - sy - oy); t.needsUpdate = true; mat.map = t;
    }
    mat.roughness = Math.min(1, Math.max(0.04, m.rough)); mat.metalness = m.metal;
    if (m.emissive) {
      const mx = Math.max(m.emissive[0], m.emissive[1], m.emissive[2], 1e-4);
      mat.emissive.setRGB(m.emissive[0] / mx, m.emissive[1] / mx, m.emissive[2] / mx, THREE.LinearSRGBColorSpace);
      mat.emissiveIntensity = mx;
      if (m.emissiveMap && textures[m.emissiveMap]) mat.emissiveMap = textures[m.emissiveMap];
    }
    if (m.transparent) { mat.transparent = true; mat.opacity = m.alpha; mat.depthWrite = false; }
    if (m.clip > 0) { mat.alphaTest = m.clip; mat.side = THREE.DoubleSide; }
    if (m.doubleSided) mat.side = THREE.DoubleSide;
    if (lm >= 0 && lightmaps[lm]) { mat.lightMap = lightmaps[lm]; mat.lightMapIntensity = Math.PI * LM_RANGE; }
    cache.set(key, mat);
    return mat;
  }
  const matIndex = (o) => parseInt((o.material && o.material.name || 'm-1').slice(1), 10);

  // ---- walk the nodes
  gltf.scene.updateMatrixWorld(true);
  const group = new THREE.Group(); group.name = 'outside';
  const byPath = {};                 // live meshes by their Unity path
  const screens = {};                // CRT screens by path
  const templates = {};              // the men in suits: pose meshes relative to their figure root
  const statics = new Map();         // geometry|material -> [{geo, matrix, lm}]
  const collisionSource = {};        // Unity path -> world geometries (for mesh colliders)
  const night = { asphalt: new Set(), lampSrc: {}, road: null, siding: null };   // Stage 1 (NIGHT)
  const nightMat = (path, mat) => {
    if (mat.name === 'M_Asphalt') night.asphalt.add(mat);
    if (path === 'Outside/Road') { if (!night.road) night.asphalt.add(night.road = hillRoadMaterial(mat)); return night.road; }
    if (HOUSE_BOX.test(path)) return night.siding || (night.siding = sidingMaterial(anisotropy));
    return mat;
  };
  gltf.scene.traverse((n) => {
    const ud = n.userData || {};
    if (!ud.path) return;
    const meshes = n.isMesh ? [n] : n.children.filter((c) => c.isMesh);
    const edit = editFor(ud.path);
    if (edit && edit.remove) return;
    for (const o of meshes) {
      const mi = matIndex(o); const m = meta.materials[mi];
      const world = edit ? edit.M.clone().multiply(o.matrixWorld) : o.matrixWorld.clone();
      if (ud.prefab) {
        const fig = ud.path.split('/').slice(0, 2).join('/');
        (templates[fig] = templates[fig] || []).push({ geo: o.geometry, mat: m && m.kind !== 'crt' ? litMaterial(mi, -1) : new THREE.MeshStandardMaterial({ color: 0x111111 }), matrix: world });
        continue;
      }
      if (/Outside\/(Hill|Road|Flynns\/)/.test(ud.path) || /Arch\d|FlynnDoor|Flynns_/.test(ud.path)) {
        (collisionSource[ud.path] = collisionSource[ud.path] || []).push(toWorld(o.geometry, world));
      }
      if (envPaths.has(ud.path)) continue;           // drawn by the environment pass instead (collision stays)
      if (sign && OLD_SIGN.test(ud.path)) continue;  // THE JUNCTION's sign stands there now
      if (m && m.kind === 'crt') {
        const mesh = new THREE.Mesh(o.geometry, makeCRTMaterial(m.crt)); mesh.matrixAutoUpdate = false; mesh.matrix.copy(world);
        mesh.name = ud.path; mesh.visible = !HIDDEN_UNTIL_DELIVERY.test(ud.path); group.add(mesh);
        screens[ud.path] = describeScreen(mesh, world);
        (byPath[ud.path] = byPath[ud.path] || []).push(mesh);
        continue;
      }
      const mat = m ? nightMat(ud.path, litMaterial(mi, ud.lm ?? -1)) : new THREE.MeshStandardMaterial();
      if (ud.path === LAMP_SRC.post || ud.path === LAMP_SRC.head) (night.lampSrc[ud.path] = night.lampSrc[ud.path] || []).push({ geo: o.geometry, mat, world });
      if (!ud.active || DYNAMIC.test(ud.path)) {
        const mesh = new THREE.Mesh(o.geometry, /LampHead_/.test(ud.path) ? mat.clone() : mat);
        mesh.matrixAutoUpdate = false; mesh.matrix.copy(world); mesh.name = ud.path; mesh.visible = !!ud.active && !HIDDEN_UNTIL_DELIVERY.test(ud.path);
        group.add(mesh); (byPath[ud.path] = byPath[ud.path] || []).push(mesh);
        continue;
      }
      const key = o.geometry.uuid + '|' + mat.uuid;
      if (!statics.has(key)) statics.set(key, { geo: o.geometry, mat, list: [] });
      statics.get(key).list.push(world);
    }
  });

  // repeated meshes -> one InstancedMesh; the rest merged per material per 40 m cell
  let drawCalls = 0; const cells = new Map();
  for (const { geo, mat, list } of statics.values()) {
    const mirrored = list.filter((m) => m.determinant() < 0), plain = list.filter((m) => m.determinant() >= 0);
    if (plain.length >= 3) {
      const im = new THREE.InstancedMesh(geo, mat, plain.length);
      plain.forEach((m, i) => im.setMatrixAt(i, m));
      im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); im.receiveShadow = true;
      group.add(im); drawCalls++;
    } else mirrored.push(...plain);
    for (const m of mirrored) {
      const g = toWorld(geo, m);
      g.computeBoundingBox(); const c = g.boundingBox.getCenter(new THREE.Vector3());
      const key = mat.uuid + '|' + Math.floor(c.x / 40) + ',' + Math.floor(c.z / 40);
      if (!cells.has(key)) cells.set(key, { mat, geos: [] });
      cells.get(key).geos.push(g);
    }
  }
  for (const { mat, geos } of cells.values()) {
    const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, mat); mesh.matrixAutoUpdate = false; mesh.receiveShadow = true;
    group.add(mesh); drawCalls++;
  }
  const env = E ? buildFlynnsEnv(E, group, byPath) : null;
  const signMats = [];             // the sign's neon and its lit letters (W.signLight)
  if (sign) {
    sign.scene.updateMatrixWorld(true);
    sign.scene.traverse((o) => {
      if (!o.isMesh) return;
      // the road in the ring is a ribbon wound away from the street (Blender draws both sides): the cream glass draws both
      o.material.side = /NeonCream/.test(o.material.name) ? THREE.DoubleSide : THREE.FrontSide;
      const mesh = new THREE.Mesh(toWorld(o.geometry, o.matrixWorld), o.material); mesh.matrixAutoUpdate = false;
      mesh.name = (o.parent && o.parent.userData.path) || o.name; group.add(mesh); drawCalls++;
      if (/^M_Junction_(Neon|Letter)/.test(o.material.name) && !signMats.includes(o.material)) { o.material.userData.ei0 = o.material.emissiveIntensity; signMats.push(o.material); }
    });
  }
  if (env) drawCalls += env.calls;

  // ---- collision: Unity's mesh, box and capsule colliders as one BVH (Flynn's doors kept apart: they open)
  const colGeos = [], doorGeos = [], polyGeos = [];
  // the office's colliders replace the old mezzanine's (its platform was narrower and its stair had no walkable head)
  const OLD_MEZZ = /\/Flynns_Mezzanine$/, officeCol = !!(E && E.col);
  if (officeCol) {
    E.col.updateMatrixWorld(true);
    E.col.traverse((o) => { if (o.isMesh) colGeos.push(toWorld(o.geometry, o.matrixWorld)); });
  }
  for (const c of meta.colliders) {
    if (!c.on || c.trigger) continue;
    if (officeCol && OLD_MEZZ.test(c.path)) continue;
    if (HIDDEN_UNTIL_DELIVERY.test(c.path)) { if (c.kind === 'box') polyGeos.push(boxGeo(c)); continue; }   // counts once delivered
    if (c.kind === 'mesh') {
      const src = collisionSource[c.path]; if (!src) continue;
      (/FlynnDoor/.test(c.path) ? doorGeos : colGeos).push(...src.map((g) => g.clone()));
    } else if (c.kind === 'box') colGeos.push(boxGeo(c));
    else if (c.kind === 'capsule') colGeos.push(capsuleGeo(c));
  }
  // the bend's lamp post stands (a tall pole of a collider: the ground under it is only known once the BVH is)
  for (const h of NIGHT.hillLamps) colGeos.push(capsuleGeo({ radius: 0.16, height: 80, c: [h.at[0], 0, h.at[1]], axis: [0, 1, 0] }));
  const bvh = new MeshBVH(mergeGeometries(colGeos.map(stripToPosition), false));
  const doorBvh = doorGeos.length ? new MeshBVH(mergeGeometries(doorGeos.map(stripToPosition), false)) : null;
  const polyBvh = polyGeos.length ? new MeshBVH(mergeGeometries(polyGeos.map(stripToPosition), false)) : null;
  const town = buildTownLights(objects, bvh);
  for (const m of town.meshes) group.add(m);
  drawCalls += town.meshes.length;

  // ---- the sky: Node/GradientSky (three bands), recoloured by the descent
  const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { tint: { value: new THREE.Color() }, horizon: { value: new THREE.Color() }, ground: { value: new THREE.Color() }, spread: { value: 1.1 }, exposure: { value: 1.15 },
      moonDir: { value: NIGHT.moonDir.clone() }, night: { value: 0 } },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    // Stage 1: with the night come the moon (a disc with soft maria, a tight halo, a wide glow) and a sparse field of stars
    fragmentShader: `uniform vec3 tint, horizon, ground, moonDir; uniform float spread, exposure, night; varying vec3 vDir;
      float h3(vec3 p){ p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
      float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h3(vec3(i, 5.0)), h3(vec3(i + vec2(1.0, 0.0), 5.0)), f.x), mix(h3(vec3(i + vec2(0.0, 1.0), 5.0)), h3(vec3(i + 1.0, 5.0)), f.x), f.y); }
      void main(){ vec3 d = normalize(vDir); float h = d.y;
        float t = 1.0 - exp(-max(h, 0.0) * (6.0 / max(0.2, spread)));
        vec3 sky = mix(horizon, tint, t); float g = clamp(-h * 7.0, 0.0, 1.0);
        vec3 col = mix(sky, ground, g) * exposure;
        if (night > 0.001 && h > 0.0) {                  // (below the horizon the ground covers it: skip the work)
          float c = dot(d, moonDir), up = smoothstep(0.0, 0.12, h);
          vec3 q = d * 260.0, cell = floor(q), f = fract(q) - 0.5 - 0.3 * (vec3(h3(cell + 7.1), h3(cell + 3.7), h3(cell + 1.3)) - 0.5);
          float star = step(0.9955, h3(cell)) * smoothstep(0.42, 0.12, length(f)) * (0.35 + 1.4 * h3(cell + 9.9)) * smoothstep(0.02, 0.3, h);
          vec3 glow = vec3(0.55, 0.68, 1.0) * (0.022 * pow(max(c, 0.0), 24.0) + 0.09 * pow(max(c, 0.0), 700.0));
          vec3 moon = vec3(0.0);
          if (c > 0.9996) {
            vec3 ax = normalize(cross(moonDir, vec3(0.0, 1.0, 0.0))), ay = cross(ax, moonDir);
            vec2 m = vec2(dot(d, ax), dot(d, ay)) / 0.0175;
            float r = length(m), disc = 1.0 - smoothstep(0.93, 1.0, r);
            float maria = 0.7 + 0.3 * smoothstep(0.3, 0.7, vn(m * 2.2 + 3.0) * 0.65 + vn(m * 5.5 + 11.0) * 0.35);
            moon = vec3(1.0, 0.97, 0.9) * disc * maria * (1.0 - 0.25 * r * r) * 1.35;
          }
          col += night * up * (glow + moon + vec3(0.85, 0.9, 1.0) * star * 0.55 * (1.0 - smoothstep(0.985, 0.9995, c)));
        }
        gl_FragColor = vec4(col, 1.0); }`,
  }));
  sky.renderOrder = -10; sky.frustumCulled = false; group.add(sky);

  // ---- lights: the sun, the flat ambient, and a pool of point lights handed to the nearest ones
  const dusk = (comps.DuskProgression || [])[0]?.fields;
  const sunDef = meta.lights.find((l) => l.name === 'DuskSun');
  const sun = new THREE.DirectionalLight(0xffffff, 1);
  sun.position.set(-sunDef.dir[0], -sunDef.dir[1], -sunDef.dir[2]).multiplyScalar(100);
  group.add(sun); group.add(sun.target);
  const ambient = new THREE.AmbientLight(0xffffff, 1); group.add(ambient);
  // with the environment pass in, the room's own lights are in the bake: off, and the rig lights the rest
  const baked = (l) => !!env && FLYNNS_BAKED_LIGHTS.test(l.name);
  const defs = meta.lights.filter((l) => l.type === 'Point').map((l) => ({
    name: l.name, pos: new THREE.Vector3(...l.pos), color: srgb(l.color), range: l.range, base: l.intensity, intensity: l.intensity, on: l.on && !baked(l) }));
  if (sign) { const d = defs.find((x) => x.name === SIGN_LIGHT.name); if (d) { d.pos.set(...SIGN_LIGHT.pos); d.color = srgb(SIGN_LIGHT.color); d.range = SIGN_LIGHT.range; d.base = d.intensity = SIGN_LIGHT.intensity; } }
  if (env) {
    defs.push(...flynnsRig(env.boxes));
    for (const d of defs) if (FLYNNS_SPILL.test(d.name)) { d.pos.z = SPILL_Z; d.range = SPILL_RANGE; }
  }
  const byName = Object.fromEntries(defs.map((d) => [d.name, d]));
  const pool = [];
  for (let i = 0; i < POOL; i++) { const p = new THREE.PointLight(0xffffff, 0, 1, 2); group.add(p); pool.push(p); }
  const spots = meta.lights.filter((l) => l.type === 'Spot' && !baked(l)).map((l) => {
    const s = new THREE.SpotLight(srgb(l.color), l.intensity * Math.PI, l.range, (l.spot / 2) * DEG, 0.4, 2);
    s.position.set(...l.pos); s.target.position.set(l.pos[0] + l.dir[0], l.pos[1] + l.dir[1], l.pos[2] + l.dir[2]);
    group.add(s); group.add(s.target); return s;
  });

  // ---- the street lamps: dark until you come within their radius, then they buzz on (LampBuzzOn)
  const lamps = (comps.LampBuzzOn || []).map((c) => {
    const f = c.fields; const def = byName[f.lamp.comp.split('/').pop()];
    if (def) def.intensity = 0;
    const heads = byPath[f.head.comp] || [];
    for (const h of heads) { h.material.emissive.setRGB(0, 0, 0); }
    return { pos: new THREE.Vector3(...c.pos), radius: f.radius, fade: f.fadeSeconds, target: f.targetIntensity, emissive: f.emissive, def, heads, k: 0, on: false };
  });
  // ---- Stage 1: the lamp at the bend: the street's own post and head, turned to reach over the hill road; it buzzes on
  // like theirs and its light joins the pool (the pool's size never changes)
  const lampPost = night.lampSrc[LAMP_SRC.post], lampHead = night.lampSrc[LAMP_SRC.head], lampDef = byName[LAMP_SRC.light];
  if (lampPost && lampHead && lampDef && lamps.length) NIGHT.hillLamps.forEach((h, i) => {
    const hit = bvh.raycastFirst(new THREE.Ray(new THREE.Vector3(h.at[0] + 0.45, 40, h.at[1]), new THREE.Vector3(0, -1, 0)), THREE.DoubleSide);
    if (!hit) return;
    const yaw = Math.atan2(-h.arm[0], -h.arm[1]) - Math.atan2(-LAMP_SRC.arm[0], -LAMP_SRC.arm[1]);
    const M = new THREE.Matrix4().makeTranslation(h.at[0], hit.point.y - 0.08, h.at[1]).multiply(new THREE.Matrix4().makeRotationY(yaw))
      .multiply(new THREE.Matrix4().makeScale(h.scale || 1, h.scale || 1, h.scale || 1)).multiply(new THREE.Matrix4().makeTranslation(-LAMP_SRC.base[0], -LAMP_SRC.base[1], -LAMP_SRC.base[2]));
    const part = (s, mat) => { const m = new THREE.Mesh(s.geo, mat); m.matrixAutoUpdate = false; m.matrix.multiplyMatrices(M, s.world); m.name = 'HillLamp_' + i; group.add(m); drawCalls++; return m; };
    for (const p of lampPost) part(p, p.mat);
    const heads = lampHead.map((p) => part(p, p.mat.clone()));
    for (const hd of heads) hd.material.emissive.setRGB(0, 0, 0);
    const def = { name: 'HillLamp_' + i, pos: lampDef.pos.clone().applyMatrix4(M), color: lampDef.color.clone(), range: lampDef.range, base: 0, intensity: 0, on: true };
    defs.push(def); byName[def.name] = def;
    lamps.push({ ...lamps[0], pos: new THREE.Vector3(h.at[0], hit.point.y + 1.1, h.at[1]), def, heads, k: 0, on: false });
  });
  night.sunDir0 = sun.position.clone().normalize(); night.town = town; night.fog = dusk ? dusk.nightFog.map((x) => x * NIGHT.fog) : null;
  for (const m of night.asphalt) m.userData.day = m.color.clone();

  const W = { group, meta, comps, objects, byPath, screens, templates, bvh, doorBvh, polyBvh, polyPlaced: false, sky, sun, ambient, defs, byName, pool, spots, lamps, dusk, drawCalls, doorsOpen: false, t: 0, env, inside: 0, night };
  W.obj = (p) => objects.get(p);
  // the floor's reflection of the room: taken once, the first time you walk in (main.js), when every light and marquee is up
  // one face a frame (six frames, no hitch at the door); true once the cube is whole and the floor shows it
  W.captureSheen = (renderer, scene) => {
    if (!env) return true;
    if (SHEEN.taken) return true;
    if (!SHEEN.cam) {
      SHEEN.cam = new THREE.CubeCamera(0.05, 30, SHEEN.rt); SHEEN.cam.position.copy(SHEEN.pos);
      SHEEN.cam.coordinateSystem = renderer.coordinateSystem; SHEEN.cam.updateCoordinateSystem(); SHEEN.cam.updateMatrixWorld(true);
      SHEEN.face = 0; SHEEN.ms = [];
    }
    const t0 = performance.now(), face = SHEEN.face++;
    const prev = renderer.getRenderTarget(), prevFace = renderer.getActiveCubeFace(), prevMip = renderer.getActiveMipmapLevel();
    SHEEN.rt.texture.generateMipmaps = face === 5;          // the mips (the blur) once, after the last face
    // the floor stays out of its own cube (it reads that texture: drawing it in would be a feedback loop, and it only looks up)
    if (SHEEN.floor) SHEEN.floor.visible = false;
    renderer.setRenderTarget(SHEEN.rt, face); renderer.render(scene, SHEEN.cam.children[face]);
    if (SHEEN.floor) SHEEN.floor.visible = true;
    renderer.setRenderTarget(prev, prevFace, prevMip);
    SHEEN.ms.push(+(performance.now() - t0).toFixed(1));
    if (face < 5) return false;
    SHEEN.taken = true; SHEEN.u.sheen.value = ENV_TUNE.sheen;
    return true;
  };
  // live tuning for the look passes (tools/envtest.mjs): lightmap gain, glow gains, indoor ambient, the rig's lights
  W.envTune = (o = {}) => {
    if (!env) return null;
    if (o.lm !== undefined) ENV_TUNE.lm = o.lm;
    if (o.amb !== undefined) ENV_TUNE.amb = o.amb;
    if (o.ambCol) ENV_TUNE.ambCol = o.ambCol;
    if (o.fx) Object.assign(ENV_TUNE.fx, o.fx);
    if (o.k !== undefined) ENV_CURVE.envK.value = o.k;
    if (o.sheen !== undefined) { ENV_TUNE.sheen = o.sheen; if (SHEEN.taken) SHEEN.u.sheen.value = o.sheen; }
    if (o.sheenLod !== undefined) SHEEN.u.sheenLod.value = o.sheenLod;
    if (o.sheenStretch !== undefined) SHEEN.u.sheenStretch.value = o.sheenStretch;
    if (o.g !== undefined) ENV_CURVE.envG.value = o.g;
    for (const m of env.tuned) {
      if (m.userData.glow) m.color.copy(m.userData.glow.col).multiplyScalar(ENV_TUNE.fx[m.name] ?? (/FixtureOn/.test(m.name) ? ENV_TUNE.fx.fixture : 1));
      else if (m.lightMap) m.lightMapIntensity = Math.PI * 4 * ENV_TUNE.lm;
    }
    for (const [name, v] of Object.entries(o.light || {})) if (byName[name]) { byName[name].base = byName[name].intensity = v; }
    W.poolT = 0;
    return { ...ENV_TUNE, k: ENV_CURVE.envK.value, g: ENV_CURVE.envG.value, sheenLod: SHEEN.u.sheenLod.value, sheenMs: SHEEN.ms, rig: defs.filter((d) => /^Env/.test(d.name)).map((d) => d.name + ' ' + d.intensity) };
  };
  // THE ARCADE ANSWERS (js/answer.js) moves three things in the room:
  //   W.signLight(k)  THE JUNCTION's sign outside, 0 dark .. 1 lit: its neon, its letters, and the red it throws on the street
  //                   and through the front windows onto the cabinets (the first knock)
  //   W.officeLamp(k) the office upstairs, 0 dark .. 1 its lamp on (the third knock; see OFFICE_LAMP)
  //   W.roomLight(k)  the room's own light, 1 as baked .. 0: the bake, the bulbs, the neon on the walls, the rig that lights the
  //                   cabinets and the props, the room's bounce, the floor's gloss. The cabinets' screens and marquees are
  //                   their own light and never dip (the answer)
  // (a light is never taken below 0.5 % of itself: the pool drops a light at zero and would take it back a quarter second late)
  W.signLight = (k) => {
    k = Math.max(0, Math.min(1.5, k)); W.signK = k;
    for (const m of signMats) m.emissiveIntensity = m.userData.ei0 * k;
    const d = byName[SIGN_LIGHT.name]; if (d) d.intensity = d.base * Math.max(0.005, k);
  };
  W.officeLamp = (k) => { if (k !== undefined) OFFICE_LAMP.lamp.value = Math.max(0, Math.min(1, k)); return OFFICE_LAMP.lamp.value; };
  W.roomK = 1;
  W.roomLight = (k) => {
    if (!env) return;
    k = Math.max(0, Math.min(1, k));
    if (W.roomK === 1 && k !== 1) W.roomBase = { envK: ENV_CURVE.envK.value };
    const base = W.roomBase || { envK: ENV_CURVE.envK.value };
    W.roomK = k;
    ENV_CURVE.envK.value = base.envK * k;
    for (const m of env.tuned) if (m.userData.glow) m.color.copy(m.userData.glow.col).multiplyScalar((ENV_TUNE.fx[m.name] ?? (/FixtureOn/.test(m.name) ? ENV_TUNE.fx.fixture : 1)) * k);
    for (const d of defs) if (/^Env/.test(d.name)) d.intensity = d.base * Math.max(0.005, k);
    if (SHEEN.taken) SHEEN.u.sheen.value = ENV_TUNE.sheen * k;
  };
  W.update = (dt, cam, feetY) => updateOutside(W, dt, cam, feetY);
  return W;
}

// the descent drives the dusk; the lamps buzz on as you pass; the light pool follows the camera
const _v = new THREE.Vector3(), _c = new THREE.Color();
function updateOutside(W, dt, cam, feetY) {
  W.t += dt;
  const d = W.dusk;
  if (d) {
    const k = Math.min(1, Math.max(0, (d.topY - feetY) / (d.topY - d.bottomY)));
    W.k = (W.k ?? k) + Math.max(-dt * 0.9, Math.min(dt * 0.9, k - (W.k ?? k)));
    const t = W.k;
    const u = W.sky.material.uniforms;
    u.tint.value.setRGB(...lerpC(d.duskTint, d.nightTint, t), THREE.SRGBColorSpace);
    u.horizon.value.setRGB(...lerpC(d.duskHorizon, d.nightHorizon, t), THREE.SRGBColorSpace);
    u.ground.value.setRGB(...lerpC(d.duskGround, d.nightGround, t), THREE.SRGBColorSpace);
    u.spread.value = lerp(d.duskThickness, d.nightThickness, t); u.exposure.value = lerp(d.duskExposure, NIGHT.sky, t);
    W.sun.color.setRGB(...lerpC(d.duskSunColor, d.nightSunColor, t), THREE.SRGBColorSpace);
    // Stage 1 (NIGHT): the sun sets into a cold moon (weaker down in the street); less flat fill; a lifted, hazier night;
    // the hill road's paint and the town's lights come up with the dark
    const N = W.night, nk = smooth01(t / 0.9);
    u.night.value = smooth01((t - 0.05) / 0.55);
    W.sun.position.copy(N.sunDir0).lerp(NIGHT.moonLight, nk).normalize().multiplyScalar(100);
    W.sun.intensity = lerp(d.duskSunIntensity, lerp(NIGHT.moon, NIGHT.moonStreet, smooth01((d.bottomY - feetY) / 8)), t) * Math.PI;
    W.ambient.color.setRGB(...lerpC(d.duskAmbient, d.nightAmbient, t), THREE.SRGBColorSpace); W.ambient.intensity = Math.PI * lerp(1.15, NIGHT.ambient, t);
    W.fogColor = new THREE.Color().setRGB(...lerpC(d.duskFog, N.fog, t), THREE.SRGBColorSpace);
    if (N.road) N.road.userData.edgeK.value = smooth01((t - 0.12) / 0.4);
    for (const m of N.asphalt) m.color.copy(m.userData.day).lerp(_c.setRGB(NIGHT.asphalt, NIGHT.asphalt, NIGHT.asphalt * 1.05, THREE.LinearSRGBColorSpace), t);
    const lit = smooth01((t - 0.1) / 0.5);
    for (const m of N.town.mats) m.color.setScalar(lit);
    // Unity's exponential fog (1 - e^-dx) matched to three's squared one near 150 m
    W.fogDensity = Math.sqrt(lerp(d.duskFogDensity, d.nightFogDensity, t) / 150);
    // inside Flynn's the bake is the light: the street's moonlight stays outside and the ambient becomes the room's warm
    // bounce (this reaches only what is not baked, the cabinets and the props: the baked surfaces take no light at all)
    if (W.env) {
      const p = cam.position, F = FLYNNS_IN;
      const inside = p.y > -30.5 ? -1 : Math.min(p.x - F.x0, F.x1 - p.x, F.z1 - p.z, p.z - F.z0);
      const s = Math.min(1, Math.max(0, inside / F.ramp)); W.inside = s * s * (3 - 2 * s);
      W.sun.intensity *= 1 - W.inside;
      _c.setRGB(ENV_TUNE.ambCol[0], ENV_TUNE.ambCol[1], ENV_TUNE.ambCol[2], THREE.SRGBColorSpace);
      W.ambient.color.lerp(_c, W.inside); W.ambient.intensity = lerp(W.ambient.intensity, ENV_TUNE.amb * (W.roomK ?? 1), W.inside);
    }
  }
  W.sky.position.copy(cam.position);
  for (const L of W.lamps) {
    if (!L.on && _v.set(cam.position.x, feetY, cam.position.z).distanceTo(L.pos) < Math.max(L.radius, NIGHT.lampReach) + 1.5) L.on = true;
    if (L.on && L.k < 1) {
      L.k = Math.min(1, L.k + dt / L.fade);
      const flick = L.k < 1 ? (Math.sin(W.t * 60) > 0.2 ? 1 : 0.35) : 1;
      if (L.def) L.def.intensity = L.target * NIGHT.lampGain * L.k * flick;
      for (const h of L.heads) h.material.emissive.setRGB(...L.emissive.slice(0, 3).map((x) => x * L.k * flick), THREE.SRGBColorSpace);
    }
  }
  // the pool: every quarter second, the lights that matter most to what the camera can see
  W.poolT = (W.poolT || 0) - dt;
  if (W.poolT <= 0) {
    W.poolT = 0.25;
    const p = cam.position;
    const ranked = W.defs.filter((l) => l.on && l.intensity > 0.01)
      .map((l) => ({ l, s: l.intensity * Math.min(1, (l.range * l.range) / Math.max(1, l.pos.distanceToSquared(p))) / (1 + l.pos.distanceTo(p) / 60) }))
      .sort((a, b) => b.s - a.s).slice(0, W.pool.length);
    W.assigned = ranked.map((r) => r.l);
  }
  W.pool.forEach((pl, i) => {
    const l = W.assigned && W.assigned[i];
    if (!l) { pl.intensity = 0; return; }
    pl.position.copy(l.pos); pl.color.copy(l.color); pl.distance = l.range; pl.intensity = l.intensity * Math.PI;
  });
}

// ---- a CRT screen: where it faces, how big, so a camera can stand square in front of it
function describeScreen(mesh, world) {
  const g = toWorld(mesh.geometry, world);      // quantized attributes cannot hold world coordinates: go to float first
  g.computeBoundingBox();
  const center = g.boundingBox.getCenter(new THREE.Vector3()), size = g.boundingBox.getSize(new THREE.Vector3());
  const n = new THREE.Vector3(), na = g.attributes.normal;
  for (let i = 0; i < na.count; i++) n.x += na.getX(i), n.y += na.getY(i), n.z += na.getZ(i);
  n.normalize();
  return { mesh, material: mesh.material, center, normal: n, size };
}

// quantized glTF attributes -> float, placed in the world (winding flipped for mirrored instances)
function toWorld(geo, m) {
  const out = new THREE.BufferGeometry();
  for (const [name, a] of Object.entries(geo.attributes)) {
    const n = a.count, s = a.itemSize, arr = new Float32Array(n * s);
    for (let i = 0; i < n; i++) for (let k = 0; k < s; k++) arr[i * s + k] = a.getComponent(i, k);
    out.setAttribute(name, new THREE.BufferAttribute(arr, s));
  }
  if (geo.index) {
    const idx = new Uint32Array(geo.index.array);
    if (m.determinant() < 0) for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
    out.setIndex(new THREE.BufferAttribute(idx, 1));
  }
  for (const want of ['uv', 'uv1', 'normal']) if (!out.attributes[want]) {
    const n = out.attributes.position.count, sz = want === 'normal' ? 3 : 2;
    out.setAttribute(want, new THREE.BufferAttribute(new Float32Array(n * sz), sz));
  }
  return out.applyMatrix4(m);
}
function stripToPosition(g) {
  const o = new THREE.BufferGeometry(); o.setAttribute('position', g.attributes.position);
  o.setIndex(g.index ? g.index : null);
  return g.index ? o : o.toNonIndexed ? o : o;
}
function boxGeo(c) {
  const ax = new THREE.Vector3(...c.ax).multiplyScalar(c.he[0]), ay = new THREE.Vector3(...c.ay).multiplyScalar(c.he[1]), az = new THREE.Vector3(...c.az).multiplyScalar(c.he[2]);
  const ctr = new THREE.Vector3(...c.c);
  const g = new THREE.BoxGeometry(2, 2, 2);
  const m = new THREE.Matrix4().makeBasis(ax, ay, az).setPosition(ctr);
  if (m.determinant() < 0) m.makeBasis(ax, ay, az.negate()).setPosition(ctr);
  return g.applyMatrix4(m);
}
function capsuleGeo(c) {
  const g = new THREE.CylinderGeometry(c.radius, c.radius, Math.max(c.height, c.radius * 2), 8, 1);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...c.axis).normalize());
  return g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...c.c), q, new THREE.Vector3(1, 1, 1)));
}

// ---------------------------------------------------------------- the body outdoors: a capsule on the BVH
// Same interface as Player (js/player.js) so main.js can hand it the controls at the areaway.
const _seg = new THREE.Line3(), _box = new THREE.Box3(), _tri = new THREE.Vector3(), _cap = new THREE.Vector3();
const _ray = new THREE.Ray(), _dir = new THREE.Vector3();
export class OutdoorBody {
  constructor(camera, W) {
    this.cam = camera; this.W = W;
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3(); this.vy = 0;
    this.yaw = 0; this.pitch = 0; this.roll = 0;
    this.eye = 1.62; this.eyeNow = 1.62; this.radius = 0.3; this.height = 1.75;
    this.speed = 2.4; this.bobT = 0; this.bob = 0; this.control = false; this.grounded = false;
    this.sens = 1; this.invert = false; this.lookOverride = null; this.moved = 0;
    this.bike = { mounted: false, speed: 0, sway: 0, slope: 0 };
  }
  place(x, y, z, yaw) { this.pos.set(x, y, z); this.yaw = yaw; this.pitch = 0; this.vel.set(0, 0, 0); this.vy = 0; }
  look(dx, dy) {
    if (!this.control) return;
    const k = 0.0022 * this.sens;
    this.yaw -= dx * k;
    this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch - dy * k * (this.invert ? -1 : 1)));
  }
  forward() { return new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)); }
  update(dt, keys) {
    const k = (c) => keys.has(c);
    if (this.bike.mounted) {
      const B = this.bike;
      const steer = (k('KeyD') || k('ArrowRight') ? 1 : 0) - (k('KeyA') || k('ArrowLeft') ? 1 : 0);
      const throttle = (k('KeyW') || k('ArrowUp') ? 1 : 0) - (k('KeyS') || k('ArrowDown') ? 1 : 0);
      if (this.control) this.yaw -= steer * 85 * DEG * dt;
      const fwd = this.forward();
      // the component of gravity along the road under the wheels (BikeController)
      let slope = 0; const hit = this.groundHit(3);
      if (hit && hit.face) {
        const n = hit.face.normal; const downhill = new THREE.Vector3(0, -1, 0).projectOnPlane(n);
        if (downhill.lengthSq() > 1e-5) slope = fwd.dot(downhill.normalize()) * (1 - n.y);
      }
      B.slope = slope;
      B.speed += 9.81 * 0.42 * slope * dt;
      if (!this.control) B.speed -= Math.sign(B.speed) * 7 * dt;
      else if (throttle > 0) B.speed += 3.6 * dt;
      else if (throttle < 0) B.speed -= 7 * dt;
      else B.speed -= Math.sign(B.speed) * 0.55 * dt;
      B.speed = Math.max(-1.6, Math.min(slope > 0.02 ? 16 : 9, B.speed));
      if (Math.abs(B.speed) < 0.06 && !throttle) B.speed = 0;
      this.vel.set(fwd.x * B.speed, 0, fwd.z * B.speed);
      B.sway += dt * (1.2 + Math.abs(B.speed) * 0.35);
    } else if (this.control) {
      const turn = (k('ArrowLeft') ? 1 : 0) - (k('ArrowRight') ? 1 : 0);
      this.yaw += turn * 1.9 * dt;
      const fwd = (k('KeyW') || k('ArrowUp') ? 1 : 0) - (k('KeyS') || k('ArrowDown') ? 1 : 0);
      const side = (k('KeyD') ? 1 : 0) - (k('KeyA') ? 1 : 0);
      const hurry = k('ShiftLeft') || k('ShiftRight') ? 1.65 : 1;
      const want = new THREE.Vector3(-Math.sin(this.yaw) * fwd + Math.cos(this.yaw) * side, 0, -Math.cos(this.yaw) * fwd - Math.sin(this.yaw) * side);
      if (want.lengthSq() > 1) want.normalize();
      want.multiplyScalar(this.speed * hurry);
      const a = 1 - Math.exp(-dt * 14);
      this.vel.x += (want.x - this.vel.x) * a; this.vel.z += (want.z - this.vel.z) * a;
    } else { this.vel.x = 0; this.vel.z = 0; }

    this.vy = this.grounded ? -1.5 : this.vy - 9.81 * dt;
    const before = this.pos.clone();
    const mv = new THREE.Vector3(this.vel.x * dt, this.vy * dt, this.vel.z * dt);
    const n = Math.max(1, Math.ceil(Math.hypot(mv.x, mv.z) / 0.12));
    this.grounded = false;
    for (let i = 0; i < n; i++) { this.pos.addScaledVector(mv, 1 / n); this.collide(); }
    // keep the wheels (and feet) on the road going downhill: snap to ground within a short reach
    if (!this.grounded && this.vy <= 0) {
      const hit = this.groundHit(this.bike.mounted ? 0.9 : 0.45);
      if (hit && hit.face && hit.face.normal.y > 0.55) { this.pos.y = hit.point.y; this.grounded = true; }
    }
    if (this.grounded) this.vy = 0;
    // a wall stops the bike instead of letting it grind along at speed
    if (this.bike.mounted && dt > 0) {
      const moved = Math.hypot(this.pos.x - before.x, this.pos.z - before.z) / dt;
      if (moved < Math.abs(this.bike.speed) * 0.5) this.bike.speed *= 0.5;
    }
    const sp = Math.hypot(this.pos.x - before.x, this.pos.z - before.z) / Math.max(dt, 1e-4);
    this.moved += sp * dt;
    const walking = !this.bike.mounted;
    this.bobT += dt * 9 * Math.min(1, sp / 2.4);
    this.bob += ((walking && sp > 0.2 ? Math.sin(this.bobT) * 0.025 : 0) - this.bob) * Math.min(1, dt * 8);
    const eye = this.bike.mounted ? 1.35 : this.eye;
    this.eyeNow += (eye - this.eyeNow) * Math.min(1, dt * 6);
  }
  groundHit(reach) {
    _ray.origin.set(this.pos.x, this.pos.y + 0.6, this.pos.z); _ray.direction.set(0, -1, 0);
    const hit = this.W.bvh.raycastFirst(_ray, THREE.DoubleSide);
    if (!hit || hit.distance > 0.6 + reach) return null;
    if (hit.face && hit.face.normal.y < 0) hit.face.normal.negate();
    return hit;
  }
  collide() {
    const r = this.radius;
    for (const bvh of [this.W.bvh, this.W.doorsOpen ? null : this.W.doorBvh, this.W.polyPlaced ? this.W.polyBvh : null, this.W.extraBvh || null]) {
      if (!bvh) continue;
      _seg.start.set(this.pos.x, this.pos.y + r, this.pos.z); _seg.end.set(this.pos.x, this.pos.y + this.height - r, this.pos.z);
      _box.makeEmpty(); _box.expandByPoint(_seg.start); _box.expandByPoint(_seg.end); _box.min.addScalar(-r); _box.max.addScalar(r);
      bvh.shapecast({
        intersectsBounds: (b) => b.intersectsBox(_box),
        intersectsTriangle: (tri) => {
          const dist = tri.closestPointToSegment(_seg, _tri, _cap);
          if (dist >= r) return;
          const depth = r - dist;
          _dir.subVectors(_cap, _tri);
          if (_dir.lengthSq() < 1e-12) tri.getNormal(_dir); else _dir.normalize();
          // something to stand on pushes straight up (no creeping down slopes); a wall pushes sideways
          if (_dir.y > 0.55) { const up = Math.min(0.35, depth / _dir.y); _seg.start.y += up; _seg.end.y += up; this.grounded = true; }
          else { _seg.start.addScaledVector(_dir, depth); _seg.end.addScaledVector(_dir, depth); }
        },
      });
      this.pos.set(_seg.start.x, _seg.start.y - r, _seg.start.z);
    }
  }
  apply(dt) {
    const c = this.cam;
    if (this.lookOverride) {
      const o = this.lookOverride; o.t = Math.min(1, o.t + dt / (o.secs || 0.55));
      const s = o.t * o.t * (3 - 2 * o.t);
      c.position.lerpVectors(o.fromPos, o.pos, s); c.quaternion.slerpQuaternions(o.fromQ, o.q, s);
      return;
    }
    const B = this.bike, k = B.mounted ? Math.min(1, Math.abs(B.speed) / 9) : 0;
    c.position.set(this.pos.x, this.pos.y + this.eyeNow + this.bob, this.pos.z);
    c.rotation.set(this.pitch, this.yaw, this.roll + Math.sin(B.sway * 2) * 0.012 * k, 'YXZ');
  }
  lookAt(center, normal, dist) {
    const pos = center.clone().addScaledVector(normal, dist);
    this.lookAtPose(pos, center);
  }
  lookAtPose(pos, target, secs) {          // secs: the glide's length (default 0.55 s)
    const m = new THREE.Matrix4().lookAt(pos, target, new THREE.Vector3(0, 1, 0));
    this.lookOverride = { fromPos: this.cam.position.clone(), fromQ: this.cam.quaternion.clone(), pos: pos.clone(), q: new THREE.Quaternion().setFromRotationMatrix(m), t: 0, secs };
  }
  release() {
    if (!this.lookOverride) return;
    const o = this.lookOverride; this.lookOverride = null;
    this.yaw = new THREE.Euler().setFromQuaternion(o.q, 'YXZ').y; this.pitch = 0;
  }
}
