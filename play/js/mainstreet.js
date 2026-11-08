// MAIN STREET AND THE TOWN (look batch 3a, 2026-10-31). The Unity street was a road, two flat slabs and some dark boxes: no parked cars, no poles or
// wires, sidewalks with razor edges, shops that were flat quads. This builds what a 1982 main street at night has, in code, with fixed seeds:
//   ground    the sidewalks (poured slabs with joints every 1.5 m, wear, stains and cracks, drawn by the pavement shader from world position),
//             bevelled kerbs and gutters, a raised crossing where the side street meets the walk, a zebra crossing, a stop line, manholes, storm
//             grates, patches and oil stains
//   cars      four parked cars (js/streetcars.js): a wood-panel wagon, a pickup, a big sedan and a hatchback; they collide
//   poles     telephone poles with crossarms, glass insulators and a transformer, a line of them along the north walk, across the street and up the
//             hill, and the wires: sagging, drawn as ribbons that never get thinner than a pixel and a half, so they do not shimmer
//   shops     five new brick fronts with displays, doors, awnings and signs; the three photo facades given frames, ledges, an awning and lamps
//   town      cornices, parapets, roofs with tanks and chimneys, window frames and lit windows on the eleven blocks behind the street
//   furniture hydrants, newspaper boxes, a mailbox, litter baskets, a bench, parking meters, stop signs, a telephone booth
//   bikes     THE JUNCTION's five display bikes wear the new chrome bars (the geometry of js/rider.js, at a lighter count)
// Called from loadOutside() (js/outside.js). Everything lands in one mesher by material, so the street is ~22 draw calls. Metres, three's axes.
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RIDER } from './rider.js';
import { Mesher, lcg, lin, mulc, WHITE, lerp, tex, nightReflect, clamp } from './streetkit.js';
import { noiseTexture, brickMaps, poleMap, woodPanelMap, roofMap, signAtlas, windowAtlas, decalAtlas, atlasUv, poolMap } from './streettex.js';
import { buildCar, carMaterials } from './streetcars.js';
import { buildTown, townMaterials } from './town.js';
import { K, WALL, GY, RY, customShop, photoShop, townBlock, sideWall, cornice, fireEscape, rooftop, bladeSign, glassWin, signQuad } from './streetshops.js';

// the old pieces this replaces: the slabs and kerbs (their colliders stay), the flat shop windows and cornices, the old zebra, the kid bikes' octagonal bars
export const STREET_OLD = /^Outside\/MainStreet\/(WalkS|WalkN_W|WalkN_E|KerbS|KerbN|Crossing|ShopWin_|ShopCornice_)|^Outside\/Flynns\/KidBike_\d\/Handlebars$/;
export const KID_BARS = /^Outside\/Flynns\/KidBike_\d\/Handlebars$/;

const Z = { sRoad: -157.6, nRoad: -164.6, wall: WALL };
const KERB = 0.17;                         // the kerb stone's width; the slab begins there
const POLE_H = 9.6;

// ---- the pavement: poured slabs of 1.5 x 1.3 m with joints, drawn from the world position. uv = (metres along the street, kind or metres from the kerb):
// v >= 0 a slab; -5 kerb; -10 gutter; -15 the raised crossing's asphalt
function walkMaterial(noise) {
  const m = new THREE.MeshStandardMaterial({ name: 'M_StreetWalk', vertexColors: true, roughness: 0.93, metalness: 0 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.wNoise = { value: noise };
    sh.vertexShader = 'varying vec3 vWW;\nvarying vec2 vWU;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n\tvWW = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;\n\tvWU = uv;');
    sh.fragmentShader = `uniform sampler2D wNoise;
varying vec3 vWW;
varying vec2 vWU;
float wh( vec2 p ) { p = fract( p * vec2( 0.1031, 0.1030 ) ); p += dot( p, p.yx + 33.33 ); return fract( ( p.x + p.y ) * p.x ); }
` + sh.fragmentShader.replace('#include <map_fragment>', `{
	float kind = vWU.y >= 0.0 ? 0.0 : ( vWU.y > -8.0 ? 1.0 : ( vWU.y > -12.0 ? 2.0 : 3.0 ) );
	vec4 nA = texture2D( wNoise, vWW.xz * 0.45 ), nB = texture2D( wNoise, vWW.xz * 1.7 + 0.37 ), nC = texture2D( wNoise, vWW.xz * 0.09 + 0.5 ), nD = texture2D( wNoise, vWW.xz * 5.5 );
	vec3 col = vec3( 0.46, 0.44, 0.40 );
	vec2 id = vec2( floor( vWU.x / 1.5 ), kind == 0.0 ? floor( vWU.y / 1.3 ) : kind );
	col *= 0.86 + 0.26 * wh( id );
	col *= 0.9 + 0.3 * ( nC.g - 0.5 ) + 0.22 * ( nA.b - 0.5 );
	col *= 1.0 + 0.3 * ( nD.r - 0.5 );
	col = mix( col, col * vec3( 0.55, 0.52, 0.46 ), smoothstep( 0.55, 0.8, nC.g ) * 0.4 );
	vec2 gc = vWW.xz / 0.45, gi = floor( gc ), gf = fract( gc );
	vec2 gp = vec2( wh( gi + 1.7 ), wh( gi + 3.1 ) ) * 0.6 + 0.2;
	float spot = step( 0.87, wh( gi + 7.0 ) ) * ( 1.0 - smoothstep( 0.03, 0.07 + 0.05 * wh( gi + 9.0 ), distance( gf, gp ) ) );
	col = mix( col, col * 0.38, spot * 0.8 );
	if ( kind < 2.0 ) {
		vec2 fw = max( fwidth( vWU ), vec2( 1e-4 ) );
		vec2 d = abs( fract( vec2( vWU.x / 1.5, kind == 0.0 ? vWU.y / 1.3 : 0.5 ) + 0.5 ) - 0.5 ) * vec2( 1.5, 1.3 );
		float jx = 1.0 - smoothstep( 0.005, 0.005 + fw.x * 1.2, d.x );
		float jy = kind == 0.0 ? 1.0 - smoothstep( 0.005, 0.005 + fw.y * 1.2, d.y ) : 0.0;
		col = mix( col, vec3( 0.045, 0.04, 0.036 ), max( jx, jy ) * 0.9 );
		col *= 1.0 - 0.16 * ( 1.0 - smoothstep( 0.012, 0.035 + fw.x, d.x ) );
		float cr = 1.0 - smoothstep( 0.0, max( fwidth( nB.g ) * 1.5, 0.007 ), abs( nB.g - 0.5 ) );
		col = mix( col, col * 0.4, cr * smoothstep( 0.68, 0.82, nC.b + 0.35 * ( nA.g - 0.5 ) ) * 0.7 );
	}
	if ( kind == 2.0 ) col *= 0.78;
	if ( kind == 3.0 ) col = vec3( 0.05, 0.05, 0.055 ) * ( 0.75 + 0.7 * nD.r ) * ( 0.85 + 0.3 * nC.g );
	diffuseColor.rgb = col;
}`);
  };
  m.customProgramCacheKey = () => 'streetWalk1';
  return m;
}
// road paint (the crossing, the stop line): worn through to the asphalt by the same world noise as the batch-1 centre line
function paintMaterial(noise) {
  const m = new THREE.MeshStandardMaterial({ name: 'M_StreetRoadPaint', vertexColors: true, roughness: 0.78, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.pNoise = { value: noise };
    sh.vertexShader = 'varying vec3 vPW;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n\tvPW = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;');
    sh.fragmentShader = 'uniform sampler2D pNoise;\nvarying vec3 vPW;\n' + sh.fragmentShader.replace('#include <map_fragment>', `{
	vec4 nA = texture2D( pNoise, vPW.xz * 0.625 ), nW = texture2D( pNoise, vPW.xz * 0.31 + 0.2 ), nF = texture2D( pNoise, vPW.xz * 3.1 );
	float worn = smoothstep( 0.32, 0.64, 0.45 * nW.g + 0.35 * nW.b + 0.3 * ( nA.r - 0.5 ) + 0.16 * ( nF.r - 0.5 ) );
	diffuseColor.rgb = mix( vec3( 0.75 + 0.35 * nA.r ), vec3( 0.045 ), worn * 0.88 );
}`);
  };
  m.customProgramCacheKey = () => 'streetRoadPaint1';
  return m;
}

// ---- the wires: ribbons whose width is set on the screen. Each point is two vertices a pixel and a half apart (perpendicular to the wire as it lies
// on the screen), so a thin wire is never thinner than the multisample can hold and does not crawl in motion. Lit by the nearest street lamps.
function wireMaterial() {
  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uRes: { value: new THREE.Vector2(1920, 1080) }, uPx: { value: 1.5 }, uLamps: { value: Array.from({ length: 8 }, () => new THREE.Vector4(0, -100, 0, 0)) } }]);
  const m = new THREE.ShaderMaterial({
    name: 'M_StreetWires', uniforms, fog: true, side: THREE.DoubleSide,
    vertexShader: `uniform vec2 uRes; uniform float uPx;
attribute vec3 aDir; attribute float aSide;
varying vec3 vWp;
#include <fog_pars_vertex>
void main() {
	vec4 mv = modelViewMatrix * vec4( position, 1.0 );
	vec4 c0 = projectionMatrix * mv, c1 = projectionMatrix * ( modelViewMatrix * vec4( position + aDir, 1.0 ) );
	vec2 d = ( c1.xy / c1.w - c0.xy / c0.w ) * uRes; float dl = length( d );
	d = dl > 1e-5 ? d / dl : vec2( 1.0, 0.0 );
	vec2 n = vec2( -d.y, d.x );
	gl_Position = c0; gl_Position.xy += n * aSide * ( uPx * 0.5 * 2.0 ) / uRes * c0.w;
	vWp = position;
	vec4 mvPosition = mv;
	#include <fog_vertex>
}`,
    fragmentShader: `uniform vec4 uLamps[8];
varying vec3 vWp;
#include <fog_pars_fragment>
void main() {
	vec3 c = vec3( 0.058, 0.062, 0.082 );
	for ( int i = 0; i < 8; i ++ ) { float d = distance( vWp, uLamps[i].xyz ); c += vec3( 0.95, 0.46, 0.10 ) * uLamps[i].w * 0.38 / ( 1.0 + d * d * 0.045 ); }
	gl_FragColor = vec4( c, 1.0 );
	#include <fog_fragment>
}`,
  });
  return m;
}

// a sagging span between two points (a catenary, near enough a parabola): n+1 points
function span(a, b, sag, n = 14) {
  const out = [];
  for (let i = 0; i <= n; i++) { const t = i / n; out.push([lerp(a[0], b[0], t), lerp(a[1], b[1], t) - sag * 4 * t * (1 - t), lerp(a[2], b[2], t)]); }
  return out;
}
function wireGeometry(lines) {
  const pos = [], dir = [], side = [], idx = [];
  for (const L of lines) {
    const base = pos.length / 3;
    for (let i = 0; i < L.length; i++) {
      const a = L[Math.max(0, i - 1)], b = L[Math.min(L.length - 1, i + 1)];
      let dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2]; const l = Math.hypot(dx, dy, dz) || 1; dx /= l; dy /= l; dz /= l;
      for (const s of [-1, 1]) { pos.push(L[i][0], L[i][1], L[i][2]); dir.push(dx, dy, dz); side.push(s); }
    }
    for (let i = 0; i + 1 < L.length; i++) { const q = base + i * 2; idx.push(q, q + 1, q + 2, q + 1, q + 3, q + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('aDir', new THREE.Float32BufferAttribute(dir, 3)); g.setAttribute('aSide', new THREE.Float32BufferAttribute(side, 1));
  g.setIndex(idx); g.computeBoundingSphere(); return g;
}

// the road up the hill (the scripted ride's way points, from the foot): the pole line follows it
const HILL_ROAD = [[3.6, -151], [4.28, -146.09], [5.42, -140.12], [7.17, -134.17], [9.88, -128.33], [13.77, -122.12], [18.18, -115.97], [22.44, -110.18], [27.16, -104.02], [32.5, -97.93], [36.24, -92.25], [36.39, -86.32]];
function alongRoad(s, off) {
  let acc = 0;
  for (let i = 1; i < HILL_ROAD.length; i++) {
    const a = HILL_ROAD[i - 1], b = HILL_ROAD[i], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (acc + l >= s) { const t = (s - acc) / l, dx = (b[0] - a[0]) / l, dz = (b[1] - a[1]) / l; return { x: lerp(a[0], b[0], t) - dz * off, z: lerp(a[1], b[1], t) + dx * off, dir: [dx, dz] }; }
    acc += l;
  }
  // past the last way point: carry on along the last segment, still offset (it used to return the way point itself, on the asphalt)
  const a = HILL_ROAD[HILL_ROAD.length - 2], b = HILL_ROAD[HILL_ROAD.length - 1], l = Math.hypot(b[0] - a[0], b[1] - a[1]), dx = (b[0] - a[0]) / l, dz = (b[1] - a[1]) / l, e = s - acc;
  return { x: b[0] + dx * e - dz * off, z: b[1] + dz * e + dx * off, dir: [dx, dz] };
}

// ---- a terrain-only height sampler for the pole line on the hill (the world's BVH is built after this runs, and the poles' colliders go into it)
export function terrainSampler(geos) {
  if (!geos.length) return () => null;
  const g = mergeGeometries(geos.map((s) => {
    const o = new THREE.BufferGeometry(); o.setAttribute('position', s.attributes.position);
    o.setIndex(s.index ? s.index : Array.from({ length: s.attributes.position.count }, (_, i) => i)); return o;
  }), false);
  const bvh = new MeshBVH(g), ray = new THREE.Ray(new THREE.Vector3(), new THREE.Vector3(0, -1, 0));
  return (x, z) => { ray.origin.set(x, 60, z); const h = bvh.raycastFirst(ray, THREE.DoubleSide); return h ? h.point.y : null; };
}

export function buildMainStreet({ anisotropy = 8, objects = [], groundAt = () => null, roadAt = () => null, kidBars = [], townOn = true } = {}) {
  const t0 = performance.now(), A = anisotropy, M = new Mesher(), rand = lcg(1982);
  const O = new Map(objects.map((o) => [o.path, o]));
  const colliders = [], capsules = [], lights = [];
  const wires = [];                                               // polylines
  const lampHeads = [];                                           // [x, y, z, lampIndex] for the wires' glow
  const noise = noiseTexture(A), SA = signAtlas(), WA = windowAtlas(), DA = decalAtlas();
  const ctx = { M, SA, WA, rand, lights, colliders };
  const stages = {}; let lastT = 0; const mark = (n) => { const t = M.tris(); stages[n] = (stages[n] || 0) + t - lastT; lastT = t; };

  // ================================================================== the ground
  const slab = (x0, x1, za, zb, kerbZ, dirSign) => {                // a slab between z (a) and (b), uv from the kerb line
    M.quad('walk', [[x0, GY, za], [x1, GY, za], [x1, GY, zb], [x0, GY, zb]], [0, 1, 0], (p) => [p[0], Math.abs(p[2] - kerbZ)], WHITE);
    void dirSign;
  };
  // one kerb + gutter run along x0..x1 on the road edge zr; s = +1 if the walk is on the +z side (the south walk), -1 for the north
  const kerbRun = (x0, x1, zr, s) => {
    const prof = [[-0.5, RY + 0.004, 'g1'], [-0.22, RY + 0.004, 'g2'], [0, RY + 0.004, 'k'], [0, GY - 0.018, 'k'], [0.006, GY - 0.008, 'k'], [0.022, GY - 0.0005, 'k'], [KERB, GY - 0.0005, 'k']];
    for (let i = 0; i + 1 < prof.length; i++) {
      const [d0, y0, kind0] = prof[i], [d1, y1] = prof[i + 1], v = kind0 === 'k' ? -5 : -10, col = kind0 === 'g1' ? mulc(WHITE, 0.62) : kind0 === 'g2' ? mulc(WHITE, 0.9) : WHITE;
      const a = [x0, y0, zr + s * d0], b = [x1, y0, zr + s * d0], c = [x1, y1, zr + s * d1], d = [x0, y1, zr + s * d1];
      // the face points to the road for the riser and up otherwise
      const out = Math.abs(y1 - y0) > Math.abs(d1 - d0) ? [0, 0, -s] : [0, 1, 0];
      M.quad('walk', [a, b, c, d], out, (p) => [p[0], v], col);
    }
  };
  // the south walk and the north walk(s); the north walk is broken for the side street, whose mouth is a raised crossing (the walk's collider runs across it)
  const SS = { x0: 62.5, x1: 69.5 };
  slab(-26, 70, Z.sRoad + KERB, -155.0, Z.sRoad, 1);
  kerbRun(-26, 70, Z.sRoad, 1);
  for (const [a, b] of [[-26, -0.5], [6.5, SS.x0], [SS.x1, 92]]) { slab(a, b, Z.nRoad - KERB, Z.wall, Z.nRoad, -1); kerbRun(a, b, Z.nRoad, -1); }
  // the side street's raised crossing: the walk's level in asphalt, a stone edge toward the street, the zebra on it
  M.quad('walk', [[SS.x0, GY, Z.nRoad - KERB], [SS.x1, GY, Z.nRoad - KERB], [SS.x1, GY, Z.wall], [SS.x0, GY, Z.wall]], [0, 1, 0], (p) => [p[0], -15], WHITE);
  kerbRun(SS.x0, SS.x1, Z.nRoad, -1);
  M.quad('walk', [[SS.x0, GY, Z.wall], [SS.x1, GY, Z.wall], [SS.x1, RY, Z.wall], [SS.x0, RY, Z.wall]], [0, 0, -1], (p) => [p[0], -5], mulc(WHITE, 0.9));
  // road paint: a continental crossing on main street east of the side street, a stop bar on the side street, the zebra on the raised table
  const bar = (x0, x1, za, zb, y = RY + 0.0035, col = [0.7, 0.7, 0.64]) => M.quad('roadpaint', [[x0, y, za], [x1, y, za], [x1, y, zb], [x0, y, zb]], [0, 1, 0], () => [0, 0], col);
  for (let z = Z.nRoad + 0.55; z < Z.sRoad - 0.5; z += 0.95) bar(70.1, 73.1, z, z + 0.5);
  for (let x = SS.x0 + 0.35; x < SS.x1 - 0.3; x += 0.95) bar(x, x + 0.5, Z.nRoad - KERB - 0.1, Z.wall + 0.1, GY + 0.0035);
  bar(SS.x0 + 0.1, SS.x0 + 3.45, -169.6, -169.25, RY + 0.0035);
  // decals: stains under the cars, manholes, storm grates, patches
  const decal = (cellName, cx, cz, w, d, col, yaw = 0, y = RY + 0.006) => {
    const r = DA.rect(cellName), c = Math.cos(yaw), s = Math.sin(yaw), hw = w / 2, hd = d / 2;
    const P = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([x, z]) => [cx + x * c - z * s, y, cz + x * s + z * c]), UV = [[r[0], r[3]], [r[2], r[3]], [r[2], r[1]], [r[0], r[1]]];
    M.quad('decal', P, [0, 1, 0], (p) => UV[P.findIndex((q) => q[0] === p[0] && q[2] === p[2])], col);
  };
  for (const [x, z] of [[22, -160.3], [52, -162.4], [66, -176.5], [-14, -160.0]]) decal('manhole', x, z, 0.86, 0.86, WHITE, rand() * 6);
  for (const [x, z, y] of [[21.5, Z.nRoad + 0.24, RY + 0.009], [45, Z.nRoad + 0.24, RY + 0.009], [58.5, Z.nRoad + 0.24, RY + 0.009], [26, Z.sRoad - 0.24, RY + 0.009], [56, Z.sRoad - 0.24, RY + 0.009]]) decal('grate', x, z, 0.95, 0.5, WHITE, 0, y);
  for (const [x, z, w, d, yaw] of [[35, -159.7, 1.8, 1.3, 0.05], [11.6, -161.9, 1.2, 2.2, 0.0], [60, -161.2, 2.4, 1.0, 0.03], [3.5, -164.5, 2.2, 1.4, 0.0], [47.5, -158.4, 1.1, 0.9, 0.0]]) decal('patch', x, z, w, d, [0.6, 0.6, 0.6], yaw);

  mark('ground');
  // ================================================================== the cars
  const CARS = [
    { kind: 'wagon', x: -4.8, side: 'S', look: { body: '#46704c' } },
    { kind: 'pickup', x: 14.8, side: 'N', look: { body: '#e8e5da', lower: '#25417a' } },
    { kind: 'sedan', x: 29.6, side: 'N', look: { body: '#c8aa68', roof: '#1b1612' } },
    { kind: 'compact', x: 46.4, side: 'N', look: { body: '#d65f16' } },
  ];
  for (const c of CARS) {
    const car = buildCar(c.kind, c.look), north = c.side === 'N';
    const cz = north ? Z.nRoad + 0.28 + car.wid / 2 + 0.02 : Z.sRoad - 0.28 - car.wid / 2 - 0.02, flip = north ? -1 : 1;       // the north curb's cars face west (the traffic on that side), the south curb's east
    const m = new THREE.Matrix4().makeTranslation(c.x, RY, cz).multiply(new THREE.Matrix4().makeRotationY(north ? Math.PI : 0));
    M.append(car.M, m);
    for (const b of car.boxes) {
      const xs = [c.x + flip * b[0], c.x + flip * b[3]];
      colliders.push([Math.min(...xs), RY + b[1], cz + b[2], Math.max(...xs), RY + b[4], cz + b[5]]);
    }
    decal('blob', c.x + flip * 0.2, cz, car.len * 0.8, car.wid * 1.25, [0.5, 0.5, 0.5]);
  }

  mark('cars');
  // ================================================================== the poles and the wires
  const insulators = [];                                           // per pole: its wire attachment points (the top one first, then each arm's)
  // a pole: a tapered round log, a cap and top pin, crossarms (u along the arm, wires at its insulators) with braces, a transformer if asked.
  // armYaw: the arms' long axis in the (x, z) plane is (cos, sin) of it, across the line the pole belongs to.
  const pole = (x, gy, z, armYaw, arms, opts = {}) => {
    const g = new THREE.CylinderGeometry(0.115, 0.165, POLE_H, 10, 4);
    M.geo('pole', g, new THREE.Matrix4().makeTranslation(x, gy + POLE_H / 2 - 0.15, z), mulc(WHITE, 0.9)); g.dispose();
    M.cyl('pole', x, gy + POLE_H - 0.25, z, 0.115, 0.0, 0.2, 10, mulc(WHITE, 0.7));
    const att = [];
    const insulator = (px, py, pz) => {
      M.cyl('metal', px, py, pz, 0.012, 0.012, 0.09, 5, K.iron);                                                                           // the pin
      M.cyl('insul', px, py + 0.04, pz, 0.05, 0.034, 0.09, 6, lin('#6fa89a'), { open: true }); M.cyl('insul', px, py + 0.12, pz, 0.036, 0.016, 0.07, 6, lin('#7fb8a8'));
      att.push([px, py + 0.2, pz]);
    };
    insulator(x, gy + POLE_H - 0.1, z);                                                                                                    // the top one
    for (const arm of arms) {
      const ya = arm.yaw ?? armYaw, ca = Math.cos(ya), sa = Math.sin(ya), y = gy + arm.y, h = arm.half, at = (u, yy) => [x + ca * u, yy, z + sa * u];
      const a = at(-h, y), b = at(h, y);
      M.box('pole', Math.min(a[0], b[0]) - 0.06, y - 0.06, Math.min(a[2], b[2]) - 0.06, Math.max(a[0], b[0]) + 0.06, y + 0.06, Math.max(a[2], b[2]) + 0.06, { col: mulc(WHITE, 0.75), uv: (p) => [0.3, (p[0] + p[2]) / 2] });
      for (const s of [-1, 1]) M.rod('pole', at(s * 0.12, y - 0.02), at(s * h * 0.62, y - 0.78), 0.028, 5, mulc(WHITE, 0.7));              // the braces
      for (const u of arm.ins) { const p = at(u, y + 0.06); insulator(p[0], p[1], p[2]); }
    }
    if (opts.xfmr) {                                                 // a pole transformer: the can on a bracket, its lid, two bushings, a ground lead
      const xy = gy + opts.xfmr.y, ox = opts.xfmr.dx, oz = opts.xfmr.dz;
      for (const dy of [-0.3, 0.3]) M.rod('metal', [x, xy + dy, z], [x + ox * 0.62, xy + dy, z + oz * 0.62], 0.025, 5, K.iron);
      M.cyl('metal', x + ox * 0.62, xy - 0.4, z + oz * 0.62, 0.23, 0.23, 0.8, 12, lin('#5a655e'));
      M.cyl('metal', x + ox * 0.62, xy + 0.4, z + oz * 0.62, 0.23, 0.11, 0.1, 12, lin('#5a655e'));
      for (const s of [-1, 1]) M.cyl('insul', x + ox * 0.62 + oz * s * 0.1, xy + 0.5, z + oz * 0.62 - ox * s * 0.1, 0.035, 0.02, 0.12, 6, lin('#7fb8a8'));
      M.rod('metal', [x + ox * 0.15, gy + 0.2, z + oz * 0.15], [x + ox * 0.15, xy - 0.3, z + oz * 0.15], 0.008, 4, K.iron);
    }
    capsules.push({ radius: 0.2, height: POLE_H, c: [x, gy + POLE_H / 2 - 0.1, z], axis: [0, 1, 0] });
    insulators.push(att);
    return att;
  };
  const ARM_A = { y: 9.1, half: 1.12, ins: [-0.95, -0.42, 0.42, 0.95] }, ARM_B = { y: 7.55, half: 0.7, ins: [-0.5, 0.5] };
  // the north line: along the shops' walk, a pole every ~26 m, the crossarms across the line (along z). The first pole carries a third arm (along x)
  // for the line that crosses the street.
  const NPZ = Z.nRoad - 0.52;
  const north = [[-2, [ARM_A, ARM_B, { y: 8.15, half: 0.7, ins: [-0.5, 0.5], yaw: 0 }], null], [24, [ARM_A, ARM_B], { y: 6.6, dx: 0, dz: 1 }], [50, [ARM_A, ARM_B], null], [73.5, [ARM_A, ARM_B], { y: 6.6, dx: -1, dz: 0 }]]
    .map(([x, arms, xf]) => pole(x, GY, NPZ, Math.PI / 2, arms, { xfmr: xf }));
  // the south corner pole, and the line up the hill beside the road (arms across the road's heading at each)
  // (the ride's way points are not the road's centre: on the bends a fixed offset put a pole on the asphalt (Daryll 10-31: "a pole in the middle of
  // the road"), so each pole steps further out until nothing within 2.5 m of it is road)
  const nearRoad = (p) => roadAt(p.x, p.z) != null || [0, 1, 2, 3, 4, 5, 6, 7].some((k) => roadAt(p.x + Math.cos(k * Math.PI / 4) * 2.5, p.z + Math.sin(k * Math.PI / 4) * 2.5) != null);
  const offRoad = (s, off) => { for (let o = off; o < off + 15; o += 0.5) { const p = alongRoad(s, o); if (!nearRoad(p)) return p; } return alongRoad(s, off + 15); };
  const S0 = [-2, Z.sRoad + 2.9], hillPts = [10, 36, 62, 88].map((s) => offRoad(s, 6.2));
  const hillY = hillPts.map((p) => { const y = groundAt(p.x, p.z); return y == null ? RY + 1 : y; });
  const s0 = pole(S0[0], GY, S0[1], 0, [ARM_A, ARM_B], { xfmr: { y: 6.7, dx: -1, dz: 0 } });
  const hill = hillPts.map((p, i) => pole(p.x, hillY[i], p.z, Math.atan2(p.dir[1], p.dir[0]) + Math.PI / 2, [ARM_A, ARM_B], { xfmr: i === 2 ? { y: 6.6, dx: -1, dz: 0 } : null }));
  // wires: poles in a chain, by insulator index; the sag is the span's own (a little over 1 % of it)
  const chain = (list) => {
    for (let i = 0; i + 1 < list.length; i++) {
      const a = list[i], b = list[i + 1], n = Math.min(a.length, b.length), len = Math.hypot(a[0][0] - b[0][0], a[0][2] - b[0][2]);
      for (let k = 0; k < n; k++) wires.push(span(a[k], b[k], 0.012 * len + 0.12 + (k % 2) * 0.05));
    }
  };
  chain(north); chain([s0, ...hill]);
  const n0Extra = north[0].slice(-2);                                // the two insulators of the first pole's third arm, across the street to the corner pole
  for (let k = 0; k < 2; k++) wires.push(span(n0Extra[k], s0[2 + k], 0.4, 16));
  // service drops from two of the poles to the shops' eaves, and the lamp heads for the wires' glow
  for (const [i, tx] of [[1, 17.5], [2, 45.5]]) { const a = north[i][0]; wires.push(span([a[0], a[1] - 0.3, a[2]], [tx, a[1] - 5.6, Z.wall + 0.1], 0.18, 10)); }
  for (let i = 1; i <= 6; i++) { const o = O.get('Outside/MainStreet/LampHead_' + i); if (o) lampHeads.push([o.pos[0], o.pos[1], o.pos[2], i - 1]); }

  mark('poles');
  // ================================================================== street furniture
  const hydrant = (x, z) => {
    const r = lin('#b3231c');
    M.cyl('metal', x, GY, z, 0.12, 0.1, 0.12, 10, r); M.cyl('metal', x, GY + 0.1, z, 0.085, 0.085, 0.5, 10, r); M.cyl('metal', x, GY + 0.6, z, 0.095, 0.095, 0.04, 10, r);
    M.cyl('metal', x, GY + 0.64, z, 0.085, 0.0, 0.1, 10, r); M.cyl('metal', x, GY + 0.74, z, 0.02, 0.02, 0.04, 6, r);
    for (const s of [-1, 1]) M.cyl('metal', x + s * 0.12, GY + 0.43, z, 0.035, 0.035, 0.1, 8, r, { rotZ: Math.PI / 2 });
    M.cyl('metal', x, GY + 0.3, z + 0.1, 0.05, 0.05, 0.08, 8, r, { rotX: Math.PI / 2 });
    colliders.push([x - 0.14, GY - 0.05, z - 0.14, x + 0.14, GY + 0.8, z + 0.14]);
  };
  const newsBox = (x, z, col, name = 'news') => {
    M.box('paint', x - 0.23, GY, z - 0.2, x + 0.23, GY + 0.92, z + 0.2, { col, faces: 'fblru' });
    M.box('metal', x - 0.2, GY + 0.5, z + 0.2, x + 0.2, GY + 0.84, z + 0.215, { col: K.black, faces: 'b' });
    M.box('paint', x - 0.25, GY + 0.92, z - 0.22, x + 0.25, GY + 0.96, z + 0.22, { col: mulc(col, 0.8) });
    signQuad(M, SA, name, x - 0.18, x + 0.18, GY + 0.54, GY + 0.8, z + 0.217);
    colliders.push([x - 0.25, GY - 0.05, z - 0.22, x + 0.25, GY + 0.96, z + 0.22]);
  };
  const mailbox = (x, z) => {
    const c = lin('#1e3b86');
    for (const s of [-1, 1]) M.box('metal', x + s * 0.2 - 0.025, GY, z - 0.17, x + s * 0.2 + 0.025, GY + 0.28, z + 0.17, { col: K.iron });
    M.box('metal', x - 0.26, GY + 0.28, z - 0.2, x + 0.26, GY + 0.98, z + 0.2, { col: c, faces: 'fblrd' });
    const g = new THREE.CylinderGeometry(0.26, 0.26, 0.4, 14, 1, false, 0, Math.PI); g.rotateZ(Math.PI / 2); g.rotateY(0);
    M.geo('metal', g, new THREE.Matrix4().makeTranslation(x, GY + 0.98, z).multiply(new THREE.Matrix4().makeRotationY(Math.PI / 2)).multiply(new THREE.Matrix4().makeRotationZ(-Math.PI / 2)), c); g.dispose();
    M.box('metal', x - 0.2, GY + 0.62, z + 0.2, x + 0.2, GY + 0.7, z + 0.21, { col: K.black }); M.box('metal', x - 0.1, GY + 0.84, z + 0.2, x + 0.1, GY + 0.88, z + 0.23, { col: K.alum });
    signQuad(M, SA, 'mail', x - 0.18, x + 0.18, GY + 0.72, GY + 0.84, z + 0.212);
    colliders.push([x - 0.27, GY - 0.05, z - 0.21, x + 0.27, GY + 1.1, z + 0.21]);
  };
  const litter = (x, z) => {
    const c = lin('#3c6a4c');
    M.cyl('metal', x, GY, z, 0.2, 0.26, 0.82, 12, c, { open: true }); M.cyl('metal', x, GY, z, 0.2, 0.2, 0.03, 12, c);
    for (const y of [0.05, 0.4, 0.8]) M.cyl('metal', x, GY + y, z, 0.27, 0.27, 0.03, 12, K.iron);
    M.cyl('metal', x, GY + 0.82, z, 0.27, 0.27, 0.02, 12, K.black, { open: true });
    colliders.push([x - 0.28, GY - 0.05, z - 0.28, x + 0.28, GY + 0.85, z + 0.28]);
  };
  const bench = (x, z) => {
    for (let i = 0; i < 4; i++) M.box('pole', x - 0.85, GY + 0.45, z + i * 0.1 - 0.2, x + 0.85, GY + 0.49, z + i * 0.1 - 0.12, { col: mulc(WHITE, 0.85), uv: (p) => [(p[0] + p[2]) / 2, p[1]] });
    for (let i = 0; i < 3; i++) M.box('pole', x - 0.85, GY + 0.62 + i * 0.12, z - 0.22 - i * 0.02, x + 0.85, GY + 0.68 + i * 0.12, z - 0.2 - i * 0.02, { col: mulc(WHITE, 0.85), uv: (p) => [(p[0] + p[2]) / 2, p[1]] });
    for (const s of [-1, 1]) { M.box('metal', x + s * 0.8 - 0.03, GY, z - 0.24, x + s * 0.8 + 0.03, GY + 0.46, z + 0.2, { col: K.iron }); M.box('metal', x + s * 0.8 - 0.03, GY + 0.46, z - 0.26, x + s * 0.8 + 0.03, GY + 0.92, z - 0.2, { col: K.iron }); }
    colliders.push([x - 0.9, GY - 0.05, z - 0.28, x + 0.9, GY + 0.95, z + 0.25]);
  };
  const meter = (x, z) => {
    M.cyl('metal', x, GY, z, 0.028, 0.028, 1.14, 6, K.tin); M.box('metal', x - 0.09, GY + 1.14, z - 0.06, x + 0.09, GY + 1.42, z + 0.06, { col: lin('#7e8486') });
    M.cyl('metal', x, GY + 1.42, z, 0.09, 0.0, 0.07, 10, lin('#7e8486')); M.quad('glow', [[x - 0.06, GY + 1.2, z + 0.062], [x + 0.06, GY + 1.2, z + 0.062], [x + 0.06, GY + 1.34, z + 0.062], [x - 0.06, GY + 1.34, z + 0.062]], [0, 0, 1], () => [0, 0], [0.1, 0.12, 0.08]);
    capsules.push({ radius: 0.06, height: 1.4, c: [x, GY + 0.7, z], axis: [0, 1, 0] });
  };
  // a stop sign on a post, its face toward (nx, nz); with street-name blades if asked
  const stopSign = (x, z, nx, nz, blades = true) => {
    const h = 2.35; M.cyl('metal', x, GY, z, 0.033, 0.033, h, 8, lin('#7d8386'));
    const R = 0.38, oct = [], uvs = [], rx = nz, rz = -nx;           // the face's right-hand direction, seen from the front
    for (let i = 0; i < 8; i++) { const a = (i + 0.5) * Math.PI / 4; oct.push([x + nx * 0.04 + rx * Math.cos(a) * R, GY + h - 0.05 + Math.sin(a) * R, z + nz * 0.04 + rz * Math.cos(a) * R]); uvs.push([Math.cos(a) * 0.5 + 0.5, Math.sin(a) * 0.5 + 0.5]); }
    const r = SA.rect('stop');
    M.quad('sign', oct, [nx, 0, nz], (p) => { const u = uvs[oct.findIndex((q) => q[0] === p[0] && q[1] === p[1] && q[2] === p[2])]; return [r[0] + u[0] * (r[2] - r[0]), r[1] + u[1] * (r[3] - r[1])]; }, WHITE);
    M.quad('metal', oct.map(([a, b, c]) => [a - nx * 0.003, b, c - nz * 0.003]), [-nx, 0, -nz], () => [0, 0], lin('#8a9092'));
    if (blades) {
      const by = GY + h + 0.3, w = 0.66, hh = 0.15;
      for (const s of [-1, 1]) { const zz = z + s * 0.012; M.quad('sign', [[x - w / 2, by, zz], [x + w / 2, by, zz], [x + w / 2, by + hh, zz], [x - w / 2, by + hh, zz]], [0, 0, s], atlasUv(SA.rect('street_main'), x - w / 2, x + w / 2, by, by + hh, 0, s < 0), WHITE); }
      for (const s of [-1, 1]) { const xx = x + s * 0.012; M.quad('sign', [[xx, by - 0.19, z - w / 2], [xx, by - 0.19, z + w / 2], [xx, by - 0.04, z + w / 2], [xx, by - 0.04, z - w / 2]], [s, 0, 0], atlasUv(SA.rect('street_cedar'), z - w / 2, z + w / 2, by - 0.19, by - 0.04, 2, s > 0), WHITE); }
    }
    colliders.push([x - 0.05, GY - 0.05, z - 0.05, x + 0.05, GY + h, z + 0.05]);
  };
  const phoneBooth = (x, z) => {
    const w = 0.46, c = lin('#21402f'), y1 = GY + 2.2;
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) M.box('metal', x + sx * w - 0.03, GY, z + sz * w - 0.03, x + sx * w + 0.03, y1, z + sz * w + 0.03, { col: c });
    M.box('metal', x - w - 0.04, y1, z - w - 0.04, x + w + 0.04, y1 + 0.3, z + w + 0.04, { col: c, faces: 'fblru' }); M.box('metal', x - w - 0.04, GY, z - w - 0.04, x + w + 0.04, GY + 0.14, z + w + 0.04, { col: c, faces: 'fblr' });
    for (const y of [0.55, 1.0, 1.45, 1.9]) for (const zz of [z - w, z + w]) M.box('metal', x - w, GY + y - 0.015, zz - 0.012, x + w, GY + y + 0.015, zz + 0.012, { col: c });
    for (const x2 of [-0.15, 0.15]) for (const zz of [z - w, z + w]) M.box('metal', x + x2 - 0.012, GY + 0.14, zz - 0.012, x + x2 + 0.012, y1, zz + 0.012, { col: c });
    for (const sx of [-1, 1]) for (const y of [0.55, 1.0, 1.45, 1.9]) M.box('metal', x + sx * w - 0.012, GY + y - 0.015, z - w, x + sx * w + 0.012, GY + y + 0.015, z + w, { col: c });
    M.quad('glow', [[x - w, GY + 0.2, z - w + 0.012], [x + w, GY + 0.2, z - w + 0.012], [x + w, y1, z - w + 0.012], [x - w, y1, z - w + 0.012]], [0, 0, 1], () => [0, 0], [0.34, 0.3, 0.19]);
    for (const s of [-1, 1]) M.quad('glow', [[x + s * (w - 0.012), GY + 0.2, z - w], [x + s * (w - 0.012), GY + 0.2, z + w], [x + s * (w - 0.012), y1, z + w], [x + s * (w - 0.012), y1, z - w]], [-s, 0, 0], () => [0, 0], [0.2, 0.18, 0.12]);
    M.box('glow', x - 0.2, y1 - 0.03, z - 0.1, x + 0.2, y1, z + 0.1, { col: [3.0, 2.7, 1.9], faces: 'd' });                      // the ceiling lamp
    M.box('metal', x - 0.14, GY + 1.0, z - w + 0.012, x + 0.14, GY + 1.34, z - w + 0.08, { col: K.black }); M.box('metal', x - 0.2, GY + 0.9, z - w + 0.012, x + 0.2, GY + 0.95, z - w + 0.2, { col: K.alum });   // the telephone and its shelf
    signQuad(M, SA, 'phone', x - 0.35, x + 0.35, y1 + 0.05, y1 + 0.25, z + w + 0.045);
    M.quad('spill', [[x - w - 0.3, GY + 0.004, z + w + 0.05], [x + w + 0.3, GY + 0.004, z + w + 0.05], [x + w + 0.6, GY + 0.004, z + w + 1.2], [x - w - 0.6, GY + 0.004, z + w + 1.2]], [0, 1, 0], () => [0, 0], [0.12, 0.1, 0.06]);
    colliders.push([x - w - 0.05, GY - 0.05, z - w - 0.05, x + w + 0.05, y1 + 0.3, z + w + 0.05]);
  };
  hydrant(36.8, Z.nRoad - 0.42); hydrant(24.6, Z.sRoad + 0.42);
  newsBox(17.6, WALL + 0.3, lin('#2a4a9a')); newsBox(18.2, WALL + 0.3, lin('#a82a22'), 'news');
  mailbox(7.4, Z.nRoad - 1.85);
  litter(20.6, Z.nRoad - 0.5); litter(43.4, Z.nRoad - 0.5); litter(36.0, Z.sRoad + 0.5); litter(-12.5, Z.nRoad - 0.5);
  bench(42.6, WALL + 0.6);
  for (const x of [14.8, 29.6, 46.4, 38.0, 55.5]) meter(x, Z.nRoad - 0.32);
  stopSign(61.4, Z.sRoad + 0.42, -1, 0, true);                      // east-bound on main street: its face to the west
  stopSign(70.0, -169.2, 0, -1, false);                             // the side street's: its face to the north (to the traffic coming down it)
  phoneBooth(11.4, -155.9);

  mark('furniture');
  // ================================================================== the shops and the town
  const SHOPS = {
    0: { theme: 'market', sign: 'market', awn: ['#2d6a4a', '#cfc7ad'], base: lin('#1a3326'), windows: ['lamp', 'blinds', 'tv'] },
    1: { theme: 'shoes', sign: 'shoes', awn: ['#243a78', '#cdc6ae'], base: lin('#1c2a52'), open: false, dim: 0.36, windows: ['dark', 'dark', 'lamp'] },
    4: { theme: 'pharmacy', sign: 'pharmacy', awn: ['#a82a2a', '#d0c9b0'], base: lin('#264a38'), rx: true, windows: ['office', 'bulb', 'blinds'] },
    6: { theme: 'barber', sign: 'barber', awn: ['#8e1f26', '#cdc6ac'], base: lin('#3a1418'), pole: true, neon: 'open_neon', windows: ['tv', 'lamp', 'dark'] },
    7: { theme: 'variety', sign: 'variety', awn: ['#c48f14', '#d6cfb4'], base: lin('#4a3a14'), windows: ['kitchen', 'shade', 'lamp'] },
  };
  for (let i = 0; i <= 7; i++) {
    const o = O.get('Outside/MainStreet/Shop_' + i); if (!o) continue;
    if (SHOPS[i]) { customShop(ctx, i, o, SHOPS[i]); mark('customShops'); } else { photoShop(ctx, i, o); mark('photoShops'); }
  }
  // the ends of the row: blank brick side walls, the lane's side of Shop_1 and Shop_2, the side street's of Shop_7, the west end of Shop_0
  const sh = (i) => { const o = O.get('Outside/MainStreet/Shop_' + i); return o ? { x0: o.pos[0] - o.scale[0] / 2, x1: o.pos[0] + o.scale[0] / 2, top: o.pos[1] + o.scale[1] / 2 } : null; };
  for (const [i, side] of [[0, -1], [1, 1], [2, -1], [7, 1]]) { const s = sh(i); if (s) sideWall(M, WA, rand, side < 0 ? s.x0 : s.x1, Z.wall, Z.wall - 9, GY, s.top, side); }
  mark('sideWalls');
  // rooftops of the shops
  const SR = { 0: ['antenna', 'vent'], 1: ['chimney', 'vent'], 2: ['ac', 'skylight'], 3: ['vent', 'ac'], 4: ['tank', 'vent'], 5: ['antenna', 'ac'], 6: ['chimney', 'vent'], 7: ['tank', 'ac'] };
  for (let i = 0; i <= 7; i++) { const s = sh(i); if (!s) continue; SR[i].forEach((k, j) => rooftop(M, rand, k, lerp(s.x0 + 1.8, s.x1 - 1.8, (j + 0.5) / SR[i].length) + (rand() - 0.5), Z.wall - 3.0 - rand() * 3.5, s.top)); }
  mark('shopRoofs');
  // the town
  if (townOn) { buildTown(ctx, O, groundAt); mark('townBatch4'); }       // look batch 4 (js/town.js): walls, windows, ground floors, roofs and streets for the eleven blocks
  for (let i = 0; i <= 10; i++) {
    const o = O.get('Outside/Town/Town_' + i); if (!o) continue;
    if (!townOn) {
      const wins = []; for (const [p, w] of O) if (p.startsWith(`Outside/Town/TWin_${i}_`)) wins.push(w);
      townBlock(ctx, i, o, wins); mark('townBlocks');
    }
    if ([3, 4, 8].includes(i)) { fireEscape(M, o.pos[0] + o.scale[0] * 0.22, o.pos[2] + o.scale[2] / 2, o.pos[1] - o.scale[1] / 2, o.pos[1] + o.scale[1] / 2); mark('fireEscapes'); }
  }
  // a rooftop HOTEL sign, a bank's clock
  {
    const o = O.get('Outside/Town/Town_4'), top = o.pos[1] + o.scale[1] / 2, zf = o.pos[2] + o.scale[2] / 2, x = o.pos[0] + 1.5;
    for (const dx of [-2.2, 2.2]) M.rod('metal', [x + dx, top, zf - 1.0], [x + dx, top + 1.0, zf - 1.0], 0.05, 5, K.iron);
    signQuad(M, SA, 'hotel', x - 2.6, x + 2.6, top + 1.0, top + 2.7, zf - 0.98);
    const b = O.get('Outside/Town/Town_9'), bt = b.pos[1] + b.scale[1] / 2, bz = b.pos[2] + b.scale[2] / 2, bx = b.pos[0] - 2.0;
    for (const dx of [-1.0, 1.0]) M.rod('metal', [bx + dx, bt, bz - 1.0], [bx + dx, bt + 0.8, bz - 1.0], 0.04, 5, K.iron);
    signQuad(M, SA, 'bank', bx - 1.4, bx + 1.4, bt + 0.8, bt + 1.65, bz - 0.98);
  }

  mark('shopsTown');
  // ================================================================== THE JUNCTION's display bikes: the new bars (js/rider.js's path and sizes, a lighter tessellation)
  {
    const bar = new Mesher(), P = RIDER.path.map(([x, y, z, f]) => { const v = new THREE.Vector3(x, y, z); v.f = f; return v; });
    const full = [];
    for (let i = P.length - 1; i >= 1; i--) { const m = new THREE.Vector3(-P[i].x, P[i].y, P[i].z); m.f = P[i].f; full.push(m); }
    for (let i = 0; i < P.length; i++) { const m = P[i].clone(); m.f = i === 0 ? 0 : P[i].f; full.push(m); }
    const cp = new THREE.CurvePath(); let cur = full[0].clone();
    for (let i = 1; i < full.length; i++) {
      const b = full[i], f = b.f || 0;
      if (f > 0 && i < full.length - 1) {
        const c = full[i + 1], d1 = b.clone().sub(cur).normalize(), d2 = c.clone().sub(b).normalize(), t1 = Math.min(f, b.distanceTo(cur) * 0.48), t2 = Math.min(f, b.distanceTo(c) * 0.48);
        const p1 = b.clone().addScaledVector(d1, -t1), p2 = b.clone().addScaledVector(d2, t2);
        if (p1.distanceTo(cur) > 1e-6) cp.add(new THREE.LineCurve3(cur.clone(), p1)); cp.add(new THREE.QuadraticBezierCurve3(p1, b.clone(), p2)); cur = p2;
      } else { cp.add(new THREE.LineCurve3(cur.clone(), b.clone())); cur = b.clone(); }
    }
    const I = new THREE.Matrix4(), tube = new THREE.TubeGeometry(cp, 36, RIDER.barR, 6, false);
    bar.geo('chrome', tube, I, WHITE); tube.dispose();
    const a = P[1], b = P[2], t = (RIDER.crossY - a.y) / (b.y - a.y), cx = a.x + (b.x - a.x) * t, cz = a.z + (b.z - a.z) * t;
    const cross = new THREE.CylinderGeometry(0.009, 0.009, cx * 2, 5, 1, true); cross.rotateZ(Math.PI / 2); cross.translate(0, RIDER.crossY, cz); bar.geo('chrome', cross, I, WHITE); cross.dispose();
    const stem = new THREE.CylinderGeometry(0.0245, 0.0245, 0.092, 8, 1); stem.rotateX(Math.PI / 2); stem.translate(0, 0.752, -0.49); bar.geo('chrome', stem, I, WHITE); stem.dispose();
    const pad = new THREE.CylinderGeometry(0.0245, 0.0245, 0.164, 8, 1); pad.rotateZ(Math.PI / 2); pad.translate(0, RIDER.crossY, cz); bar.geo('trim', pad, I, lin('#23469a')); pad.dispose();
    const p3 = P[3], p4 = P[4], dir = new THREE.Vector3(p4.x - p3.x, p4.y - p3.y, p4.z - p3.z), runLen = dir.length(); dir.normalize();
    const L = runLen - RIDER.gripInset - 0.0022, start = new THREE.Vector3(p3.x, p3.y, p3.z).addScaledVector(dir, RIDER.gripInset);
    for (const sx of [1, -1]) {
      const prof = [[0.0, 0], [0.0218, 0.0006], [0.0214, 0.005], [RIDER.gripR, 0.008], [RIDER.gripR + 0.0008, L * 0.5], [RIDER.gripR, L - 0.008], [0.0205, L - 0.0036], [0.0, L + 0.002]].map(([r, y]) => new THREE.Vector2(r, y));
      const g = new THREE.LatheGeometry(prof, 8), d = dir.clone(); d.x *= sx;
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d), pos = start.clone(); pos.x *= sx;
      bar.geo('trim', g, new THREE.Matrix4().compose(pos, q, new THREE.Vector3(1, 1, 1)), lin('#17171a')); g.dispose();
    }
    // the old handlebar mesh's frame in the bike's own (it is how main.js places these bars on the parked bike): pos, 90 degrees about x, scale .297
    const localHb = new THREE.Matrix4().compose(new THREE.Vector3(0, 0.8487, -0.4545), new THREE.Quaternion(Math.SQRT1_2, 0, 0, Math.SQRT1_2), new THREE.Vector3(0.297, 0.297, 0.297)), inv = localHb.clone().invert();
    for (const kb of kidBars) M.append(bar, kb.world.clone().multiply(inv));
  }

  mark('bikes');
  // ================================================================== meshes
  const group = new THREE.Group(); group.name = 'MainStreet';
  const rb = brickMaps(), poleTex = tex(poleMap(), A), woodTex = tex(woodPanelMap(), A), roofTex = tex(roofMap(), A);
  const winTex = tex(WA.c, A, { clamp: true }), signTex = tex(SA.c, A, { clamp: true }), decalTex = tex(DA.c, A, { clamp: true });
  const S = (o) => new THREE.MeshStandardMaterial(o);
  const mats = {
    walk: walkMaterial(noise), roadpaint: paintMaterial(noise),
    paint: S({ name: 'M_StreetPaintwork', vertexColors: true, roughness: 0.72 }), conc: S({ name: 'M_StreetStone', vertexColors: true, roughness: 0.94 }),
    metal: nightReflect(S({ name: 'M_StreetMetal', vertexColors: true, roughness: 0.42, metalness: 0.6 }), { k: 1.1, ceil: 0.4, key: 'smetal' }),
    brick: S({ name: 'M_StreetBrick', map: tex(rb.color, A), bumpMap: tex(rb.height, A, { data: true }), bumpScale: 0.012, vertexColors: true, roughness: 0.92, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }),
    pole: S({ name: 'M_StreetWood', map: poleTex, vertexColors: true, roughness: 0.9 }),
    insul: nightReflect(S({ name: 'M_StreetInsulator', vertexColors: true, roughness: 0.12, metalness: 0 }), { k: 2.2, ceil: 0.5, key: 'sinsul' }),
    roof: S({ name: 'M_StreetRoof', map: roofTex, vertexColors: true, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }),
    awning: S({ name: 'M_StreetAwning', vertexColors: true, roughness: 0.88, side: THREE.DoubleSide }),
    glow: new THREE.MeshBasicMaterial({ name: 'M_StreetGlow', vertexColors: true }),
    glass: new THREE.MeshBasicMaterial({ name: 'M_StreetGlass', map: winTex, vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -6 }),
    sign: new THREE.MeshBasicMaterial({ name: 'M_StreetSign', map: signTex, vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -6 }),
    spill: new THREE.MeshBasicMaterial({ name: 'M_StreetSpill', vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }),
    pool: new THREE.MeshBasicMaterial({ name: 'M_StreetPool', map: tex(poolMap(), A, { clamp: true }), vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -5 }),
    decal: S({ name: 'M_StreetDecal', map: decalTex, vertexColors: true, transparent: true, depthWrite: false, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }),
    ...carMaterials(THREE, nightReflect, A, woodTex),
    ...(townOn ? townMaterials(A, THREE, rb).mats : {}),
  };
    let tris = 0, calls = 0;
  for (const k of M.b.keys()) {
    if (!mats[k]) { console.warn('[mainstreet] no material for', k); continue; }
    const g = M.build(k), mesh = new THREE.Mesh(g, mats[k]); mesh.name = 'MainStreet/' + k; mesh.matrixAutoUpdate = false;
    if (k === 'spill' || k === 'pool') mesh.renderOrder = 3; if (k === 'decal') mesh.renderOrder = 2;
    group.add(mesh); tris += g.index.count / 3; calls++;
  }
  // the wires
  const wmat = wireMaterial(), wg = wireGeometry(wires), wmesh = new THREE.Mesh(wg, wmat); wmesh.name = 'MainStreet/wires'; wmesh.frustumCulled = false; wmesh.matrixAutoUpdate = false;
  const lampRefs = [], size = new THREE.Vector2();
  wmesh.onBeforeRender = (renderer) => {
    const t = renderer.getRenderTarget(); if (t) size.set(t.width, t.height); else renderer.getDrawingBufferSize(size);
    wmat.uniforms.uRes.value.copy(size);
    const U = wmat.uniforms.uLamps.value;
    for (let i = 0; i < 8; i++) {
      const h = lampHeads[i];
      if (!h) { U[i].set(0, -100, 0, 0); continue; }
      const L = lampRefs[h[3]]; U[i].set(h[0], h[1], h[2], L ? L.k : 1);
    }
  };
  group.add(wmesh); tris += wg.index.count / 3; calls++;
  const fadeMats = [mats.glow, mats.glass, mats.sign, mats.spill, mats.pool, ...(mats.tsign ? [mats.tsign] : [])];
  const bindLamps = (lamps) => { lampRefs.length = 0; for (let i = 0; i < 6; i++) { const h = lampHeads.find((q) => q[3] === i); lampRefs.push(h ? lamps.find((L) => Math.abs(L.pos.x - h[0]) < 1.5 && Math.abs(L.pos.z - h[2]) < 3) : null); } };
  return { group, colliders, capsules, lights, fadeMats, bindLamps, stats: { tris, calls, stages, wires: wires.length, poles: insulators.length, cars: CARS.length, kidBars: kidBars.length, buildMs: +(performance.now() - t0).toFixed(1) } };
}
void clamp;
