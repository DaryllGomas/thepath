// THE CABINET WITH NO NAME · its glass: js/crt.js's tube (the same uniforms, the same scanlines, grille, roll, snow), with one
// difference: the picture comes out of the arcade's grade (js/post.js: exposure, the warm filter, contrast, saturation, ACES)
// looking as it does on the game's own page.
//
// Why: the seven games tone-map themselves (their look kit's 1 - e^-x); the arcade then grades every screen again, and ACES's
// toe crushes their dark paintings (the Beacon's sky, the Tunnel's rings measured near black on the glass). So the glass
// hands the room the light that the room's grade turns back into the game's own picture: UNGRADE (the grade, inverted per
// pixel; the grade's live exposure and filter are read from the pipeline). Its bloom still adds the tube's glow in the room.
//
//   const mat = makeSevenGlass(crtMaterial, pipe)     a new material for the cabinet's screen mesh (crtMaterial's values)
//   UNGRADE_GLSL                                      the function (js/ending.js's tunnel uses it for its tube, so the swap
//                                                     at the pull matches); uniforms: gradeExposure, gradeFilter, gradeOn,
//                                                     gradeO (the ACES output matrix, inverted), gradeI (its input, inverted)
import * as THREE from 'three';

// js/post.js's ACES matrices (GLSL column vectors) and constants; kept in step with finalFrag there
const ACES_I = [[0.59719, 0.07600, 0.02840], [0.35458, 0.90834, 0.13383], [0.04823, 0.01566, 0.83777]];
const ACES_O = [[1.60475, -0.10208, -0.00327], [-0.53108, 1.10813, -0.07276], [-0.07367, -0.00605, 1.07602]];
function inverseOf(cols) {
  const m = new THREE.Matrix3();
  m.set(cols[0][0], cols[1][0], cols[2][0], cols[0][1], cols[1][1], cols[2][1], cols[0][2], cols[1][2], cols[2][2]);
  return m.invert();
}

export const UNGRADE_GLSL = /* glsl */`
  uniform float gradeExposure, gradeOn; uniform vec3 gradeFilter; uniform mat3 gradeO, gradeI;
  // ACES's fit (js/post.js), solved for its input: y = (v(v + a) - b) / (v(c v + d) + e)
  vec3 fitInv(vec3 y) {
    const float a = 0.0245786, b = 0.000090537, c = 0.983729, d = 0.4329510, e = 0.238081;
    vec3 A = 1.0 - c * y, B = a - d * y, C = -(b + e * y);
    return (-B + sqrt(max(B * B - 4.0 * A * C, 0.0))) / (2.0 * A);
  }
  // k = the linear colour the player should see (the game's page); returns the light the arcade's grade turns into k
  vec3 ungrade(vec3 k) {
    if (gradeOn < 0.5) return k;
    vec3 t = clamp(gradeO * clamp(k, 0.0, 0.97), 0.0, 0.97);        // out of ACES's output matrix (the clamp keeps it finite)
    vec3 c = gradeI * fitInv(t) * 0.6;                              // back through its fit and its input matrix
    c = max(c, 0.0);
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    c = max(vec3(l) + (c - vec3(l)) / 0.9, 0.0);                    // saturation 0.9, undone
    c = 0.18 * pow(max(c, vec3(1e-6)) / 0.18, vec3(1.0 / 1.08));    // contrast, undone
    return c / max(gradeExposure * gradeFilter, vec3(1e-4));        // exposure and the warm filter, undone
  }`;

const vert = /* glsl */`
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const frag = /* glsl */`
  uniform sampler2D map; uniform sampler2D nextMap;
  uniform float blend, brightness, flicker, curve, scan, scanCount, grille, vignette, chroma, roll, noise, time, power;
  varying vec2 vUv;
  ${UNGRADE_GLSL}
  float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
  vec3 frame(vec2 uv) { return mix(texture2D(map, uv).rgb, texture2D(nextMap, uv).rgb, blend); }
  void main() {
    vec2 uv0 = vec2(vUv.x, 1.0 - vUv.y);
    vec2 c = uv0 * 2.0 - 1.0;
    float r2 = dot(c, c);
    c *= 1.0 + curve * r2;
    vec2 uv = c * 0.5 + 0.5;
    float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
    vec3 col;
    col.r = frame(uv + vec2(chroma, 0.0)).r;
    col.g = frame(uv).g;
    col.b = frame(uv - vec2(chroma, 0.0)).b;
    float sc = 1.0 - scan * (0.5 + 0.5 * sin(uv.y * scanCount * 6.2831853));
    float px = mod(gl_FragCoord.x, 3.0);
    vec3 gr = 1.0 - grille * (1.0 - vec3(step(px, 1.0), step(1.0, px) * step(px, 2.0), step(2.0, px)));
    float ph = fract(uv.y * 0.5 - time * 0.08);
    float bar = 1.0 + roll * smoothstep(0.0, 0.08, ph) * (1.0 - smoothstep(0.08, 0.2, ph));
    float snow = 1.0 + noise * (hash(uv * 400.0 + time) - 0.5);
    vec2 v = uv * (1.0 - uv);
    float vig = pow(clamp(v.x * v.y * 40.0, 0.0, 1.0), vignette * 0.35);
    col = col * sc * gr * bar * snow * vig * inside;
    col *= brightness * flicker * power;
    col = ungrade(col);
    col += vec3(0.004, 0.006, 0.010) * inside;
    gl_FragColor = vec4(col, 1.0);
  }`;

/** The grade's uniforms, shared with the pipeline (live: a dev exposure tweak follows). */
export function gradeUniforms(pipe) {
  const P = pipe && pipe.mFinal && pipe.mFinal.uniforms;
  return {
    gradeExposure: P ? P.exposure : { value: Math.pow(2, 0.55) },
    gradeFilter: P ? P.filterCol : { value: new THREE.Vector3(1, 0.913, 0.787) },
    gradeOn: { value: 1 },
    gradeO: { value: inverseOf(ACES_O) }, gradeI: { value: inverseOf(ACES_I) },
  };
}

/** The seven's glass, made from the cabinet's own CRT material (its values), for the same mesh. */
export function makeSevenGlass(crt, pipe, look = {}) {
  const u = {};
  for (const [k, v] of Object.entries(crt.uniforms)) u[k] = { value: v.value && v.value.clone ? v.value.clone() : v.value };
  u.map.value = crt.uniforms.map.value; u.nextMap.value = crt.uniforms.nextMap.value;
  Object.assign(u, gradeUniforms(pipe));
  for (const [k, v] of Object.entries(look)) if (u[k]) u[k].value = v;
  const m = new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: frag, uniforms: u, fog: false });
  m.name = 'M_SevenGlass';
  return m;
}
