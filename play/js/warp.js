// THE WARP: the end of the Prologue's pull (Daryll 10-28: "there's like a warping kind of tunnel where time is passing by ...
// you get sucked in, and that's the whole transition. It's in the trailer"). The look is the trailer v2's, 44-52 s
// (hq-img/sb/spine-pull-03 and -04): a deep navy space whose stars streak outward from the middle, white and gold and pale
// blue; THE GATE's two rings over it, crossing on a thin vertical beam; a white lens (the vesica) burning at the far end; lit
// panes of glass flying past on the tunnel's walls, some holding the past (a pyramid at sunset, a moon behind a tower, a stone
// pillar, a ship, columns, a clock); then the lens opens into white.
//
// Played in the engine, in real time: its own small scene (a background drawn per pixel from the view ray, instanced streaks
// and panes with real parallax), rendered into its own target. While you are still in the arcade the tube's glass samples that
// target at screen position, so the glass is a window into the warp (js/ending.js's tunnel material); once you are through,
// the same picture is shown full screen (blit), so the hand-over does not show. Colours are written as the player should see
// them (linear) and turned back through the room's grade (UNGRADE_GLSL) on the way out, so the arcade's warm grade does not
// tint the trailer's blue. Every value stays finite: normalizes are guarded, the target is clamped and NaN-filtered.
//
//   const w = new Warp(renderer, gradeUniforms);    w.set({ ... }) each frame;  w.render(camera, width, height)
//   w.texture (the picture), w.blitScene / w.blitCam (full screen), w.warm() once at load
import * as THREE from 'three';
import { UNGRADE_GLSL } from './cabinet/seven/glass.js';

const WL = 12.0, MARGIN = 1.2;          // the streaks and panes repeat every WL m down the tunnel; MARGIN m may sit behind you
const ROWS = 5;                         // the panes' atlas: 2 x 5 cells of 512 x 256 (8 paintings, then bare glass warm and cool)
const HERO_K = 0.22;                    // the two great panes slide by at this part of the tunnel's speed (they are big and far)
// the paintings on the panes: our own art, cropped and graded warm (tools/warp_paint_atlas.sh): 0 the trailer's pyramid at
// sunset, 1 its moon behind the ship's mast, 2-7 the worlds ahead (Gobekli Tepe, Egypt, the East, the Vale, the Signal,
// Atlantis), 8-9 bare glass. Loaded through three's TextureLoader; the canvas paintings below stay as the fallback.
const PANES_URL = new URL('../assets/art/warp/panes.jpg', import.meta.url).href;

// the colour helpers every warp shader shares
const COMMON = /* glsl */`
  float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
  vec3 safeN(vec3 v, vec3 fb) { float l = length(v); return l > 1e-6 ? v / l : fb; }
  vec3 lin(vec3 s) { return pow(max(s, vec3(0.0)), vec3(2.2)); }
  float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }   // no banding at big inputs
`;
// the room's grade, undone: up to 0.97 exactly (UNGRADE_GLSL), and what is brighter than that goes on as light, so it blooms
export const UNGRADE_HDR = /* glsl */`
  vec3 ungradeHDR(vec3 k) {
    k = clamp(k, 0.0, 64.0);
    vec3 lo = min(k, vec3(0.97));
    return ungrade(lo) + (k - lo) * 2.0;
  }`;

// ---------------------------------------------------------------- the background: drawn per pixel from the view ray
const bgVert = /* glsl */`
  uniform mat4 invProj, camWorld;
  varying vec3 vDir;
  void main() {
    vec4 v = invProj * vec4(position.xy, 1.0, 1.0);
    vDir = (camWorld * vec4(v.xyz / v.w, 0.0)).xyz;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }`;
const bgFrag = /* glsl */`
  uniform float time, flowT, speed, lensQ, ringQ, ringA, bloom, beam, streakLen, density, burst;
  varying vec3 vDir;
  ${COMMON}
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
  }
  // one layer of streaks: N cells round the middle, each a run of dashes moving outward in log-radius
  vec3 streaks(float a01, float lr, float N, float dens, float spd, float seed, float len, float on) {
    float a = a01 * N;
    float ci = floor(a), fa = fract(a) - 0.5;
    float h1 = hash(vec2(ci, seed)), h2 = hash(vec2(ci, seed + 7.13)), h3 = hash(vec2(ci, seed + 3.71));
    float u = lr * dens - flowT * spd * (0.55 + 0.9 * h2) + h1 * 31.0;
    float cu = floor(u), fu = fract(u);
    float h4 = hash(vec2(ci * 1.37 + seed, cu));
    float lit = step(1.0 - on, h4);
    float L = len * (0.5 + h3);
    float s = smoothstep(0.0, 0.04, fu) * (1.0 - smoothstep(L * 0.25, L + 0.02, fu));      // a bright head, a long fading tail
    float th = max(0.06, fwidth(a) * 0.6);                  // thin and sharp, as the trailer's
    float w = exp(-fa * fa / (th * th)) * (0.11 / th);
    vec3 c = h3 > 0.78 ? vec3(1.0, 0.78, 0.46) : (h3 > 0.45 ? vec3(0.62, 0.72, 1.0) : vec3(0.92, 0.95, 1.0));
    return c * s * w * lit * (0.35 + 1.1 * h4 * h4);
  }
  float ring(vec2 q, vec2 c, float R, float w) {
    float d = abs(length(q - c) - R);
    float ww = max(w, fwidth(d) * 0.9);
    return exp(-d * d / (ww * ww)) * (w / ww);
  }
  void main() {
    vec3 d = safeN(vDir, vec3(0.0, 0.0, -1.0));
    float f = max(-d.z, 0.04);
    vec2 q = d.xy / f;                                   // where the ray meets a plane one unit down the tunnel
    float r = max(length(q), 1e-4);
    float lr = log(r);
    float a01 = atan(q.y, q.x) / 6.2831853 + 0.5;
    // ---- deep space: navy, an indigo heart, slow violet cloud
    vec3 col = mix(lin(vec3(0.010, 0.013, 0.032)), lin(vec3(0.07, 0.08, 0.19)), exp(-r * 1.3));     // near black, a deep navy heart
    vec2 np = q / (0.35 + r) * 3.0 + vec2(time * 0.01, 0.0);
    float n = vnoise(np * 2.0) * 0.6 + vnoise(np * 5.0 + 3.1) * 0.4;
    col += lin(vec3(0.30, 0.24, 0.55)) * 0.14 * smoothstep(0.45, 0.95, n) * exp(-r * 0.4);
    col += lin(vec3(0.20, 0.30, 0.60)) * 0.06 * smoothstep(0.55, 1.0, vnoise(np * 3.0 - 7.7)) ;
    // ---- the stars, streaking out from the middle (three layers; longer with speed)
    float edge = smoothstep(0.03, 0.35, r);
    vec3 st = streaks(a01, lr, 720.0, 7.0 * density, 1.0, 1.3, streakLen, 0.30)
            + streaks(a01, lr, 1300.0, 11.0 * density, 1.4, 5.7, streakLen * 0.8, 0.22) * 0.8
            + streaks(a01, lr, 420.0, 4.0 * density, 0.7, 9.1, streakLen * 1.2, 0.18) * 1.2;
    // sharp, and kept under the bloom's knee (0.97 after the grade) so a thousand bright heads do not haze into soft blobs
    // as the light comes, the space between the streaks turns a lit blue (the trailer, 49-51 s), never a grey haze
    col += lin(vec3(0.16, 0.24, 0.62)) * (0.10 * smoothstep(8.0, 14.0, speed) + 0.30 * bloom) * edge;
    vec3 stB = min(st * edge * (0.55 + 0.6 * smoothstep(0.2, 1.6, r)) * 0.9, vec3(0.8));
    col += stB;
    // long shafts of light down the tunnel, converging on the lens (stronger below, as the trailer has them)
    float sa = a01 * 210.0, sci = floor(sa), sfa = fract(sa) - 0.5;
    float sh = hash(vec2(sci, 41.0)), sh2 = hash(vec2(sci, 43.0));
    float sth = max(0.07, fwidth(sa) * 0.75);
    float shaft = step(0.64, sh) * exp(-sfa * sfa / (sth * sth)) * (0.07 / sth) * smoothstep(0.15, 0.9, r) * (0.5 + 0.5 * sin(lr * 3.0 - flowT * (0.6 + sh2) + sh * 40.0));
    col += mix(vec3(0.70, 0.78, 1.0), vec3(1.0, 0.86, 0.62), step(0.85, sh2)) * shaft * (q.y < 0.0 ? 0.50 : 0.18) * edge;
    // ---- THE GATE: two rings crossing on the axis, the beam through their crossings
    float R = ringQ, off = 0.40 * R, rw = max(R * 0.0032, 0.0011);
    float rings = ring(q, vec2(-off, 0.0), R, rw) + ring(q, vec2(off, 0.0), R, rw);
    float rglow = exp(-abs(abs(length(q - vec2(-off, 0.0)) - R)) / (R * 0.03)) + exp(-abs(abs(length(q - vec2(off, 0.0)) - R)) / (R * 0.03));
    col += (vec3(1.0, 0.96, 0.90) * rings * 1.25 + vec3(0.75, 0.80, 1.0) * rglow * 0.04) * ringA;
    // faint gold circles further out (the trailer's thin arcs)
    col += vec3(1.0, 0.80, 0.50) * ring(q, vec2(0.0), R * 1.42, rw * 0.6) * 0.22 * ringA;
    float yc = sqrt(max(R * R - off * off, 0.0));       // where the rings cross
    for (int i = 0; i < 2; i++) {
      vec2 p = q - vec2(0.0, i == 0 ? yc : -yc);
      float fl = exp(-length(p) / (R * 0.02)) * 0.9 + exp(-abs(p.y) / (R * 0.004)) * exp(-abs(p.x) / (R * 0.06)) * 0.5
               + exp(-abs(p.x) / (R * 0.004)) * exp(-abs(p.y) / (R * 0.12)) * 0.7;
      col += vec3(1.0, 0.96, 0.88) * fl * ringA;
    }
    float bw = max(0.0022, fwidth(q.x) * 0.8);
    col += vec3(1.0, 0.95, 0.85) * exp(-abs(q.x) / bw) * (0.0022 / bw) * beam * (0.35 + 1.1 * exp(-abs(q.y) / max(lensQ * 2.2, 1e-3)));
    // ---- the lens: two circles' meeting, standing tall, white at the rim, full of light
    float rho = lensQ / 0.835, lc = 0.55 * rho;
    float sd = max(length(q - vec2(-lc, 0.0)), length(q - vec2(lc, 0.0))) - rho;
    float sdn = sd / max(lensQ, 1e-3);
    float inside = 1.0 - smoothstep(-0.03, 0.0, sdn);
    // inside: blue-white light, brighter to the middle, its own fine streaks rushing out of the centre
    vec3 sti = streaks(a01, lr, 1100.0, 16.0, 1.8, 2.9, 0.5, 0.35) + streaks(a01, lr, 600.0, 10.0, 1.2, 8.3, 0.6, 0.3);
    vec2 gq = q * 95.0;                                  // ~3 px cells: finer aliases into a grid
    float dust = step(0.86, hash12(floor(gq) + vec2(floor(flowT * 6.0) * 37.0, floor(flowT * 6.0) * 11.0))) * (1.0 - smoothstep(0.15, 0.5, length(fract(gq) - 0.5)));
    vec2 gq2 = q * 61.0 + 0.5;                           // a second, coarser grain of brighter stars that twinkle
    float h2 = hash12(floor(gq2) + 17.0);
    float dust2 = step(0.9, h2) * (1.0 - smoothstep(0.1, 0.45, length(fract(gq2) - 0.5))) * (0.5 + 0.5 * sin(time * 9.0 + h2 * 60.0));
    // inside: a cool sparkling field, darker between the stars so the grain shows (the trailer's lens is starry, not flat white)
    float cen = exp(-r / max(lensQ, 1e-3) * 2.2);
    vec3 fill = lin(vec3(0.70, 0.77, 0.96)) * (0.34 + 0.40 * cen) + sti * (1.8 + 5.0 * cen) + vec3(0.95, 0.97, 1.0) * (dust * 1.2 + dust2 * 2.6)
      + vec3(0.9, 0.95, 1.0) * pow(vnoise(vec2(a01 * 260.0, lr * 2.0 - flowT * 1.5)), 4.0) * (0.2 + 1.6 * cen);   // a radial burst from the middle
    fill = mix(fill, vec3(1.0, 0.99, 0.97) * (1.0 + 2.0 * bloom), smoothstep(0.25, 0.85, bloom));
    float lensGo = 1.0 - smoothstep(0.55, 0.9, bloom);   // the lens melts into the round white burst (the trailer, 51 s): no white diamond
    col = mix(col, fill, inside * lensGo);
    float out1 = smoothstep(-0.02, 0.04, sdn);
    float rim = exp(-sdn * sdn / 0.00025) * 1.0;                         // a thin bright rim (the trailer's), not a thick white band
    vec2 tp = vec2(abs(q.x), abs(abs(q.y) - lensQ));                    // the lens's tips burn on the beam
    rim += exp(-length(tp) / max(lensQ * 0.035, 1e-4)) * 1.2 + exp(-tp.x / max(lensQ * 0.006, 1e-4)) * exp(-tp.y / max(lensQ * 0.25, 1e-4)) * 0.5;
    float halo = exp(-max(sdn, 0.0) / (0.10 + 0.3 * bloom)) * (0.12 + 0.55 * bloom) * out1;
    float rays = pow(vnoise(vec2(a01 * 160.0, flowT * 0.3)), 3.0) * exp(-max(sdn, 0.0) / (0.5 + 1.0 * bloom)) * (0.22 + 0.6 * bloom) * out1;
    col += vec3(1.0, 0.97, 0.92) * rim * lensGo + vec3(0.78, 0.86, 1.0) * (halo + rays);           // a white rim, a cool glow off it
    // the light takes everything: the stars burn brighter and longer, and a white burst grows out along them, spiked by
    // rays, the streaks still running to the edges between its spikes, until the frame is white (the trailer, 50-52 s)
    col += min(st * edge * bloom * 0.7, max(vec3(0.88) - stB, vec3(0.0)));     // brighter, still sharp (all under the bloom's knee)
    col = mix(col, min(col, vec3(0.92)), smoothstep(0.3, 0.6, bloom));  // while the light grows, the field stays under the knee: crisp streaks, no lumps
    float spike = pow(vnoise(vec2(a01 * 700.0, flowT * 0.1)), 2.0) * 0.6 + pow(vnoise(vec2(a01 * 140.0, 3.0)), 2.0) * 0.4;   // a fine radial fringe
    float re = length(q * vec2(0.78, 1.0));
    float br = burst;
    float core = (1.0 - smoothstep(br * (0.7 + 0.15 * spike), br * (1.0 + 0.6 * spike) + 1e-4, re)) * step(0.001, bloom);
    col = mix(col, vec3(1.0, 0.985, 0.96) * 1.08, core);               // just over the knee: white, without flooding the frame with bloom
    col = mix(col, vec3(1.0, 0.985, 0.96) * 1.5, smoothstep(1.85, 2.05, burst));      // the whole frame only in the last ~0.2 s
    gl_FragColor = vec4(clamp(col, 0.0, 64.0), 1.0);
  }`;

// ---------------------------------------------------------------- the streaks that fly past: instanced, real 3D
const streakVert = /* glsl */`
  attribute vec4 aS;                 // angle, radius, z0, seed
  uniform float flow, camZ, speed, pxA, clipZ, nearFade;
  varying float vI, vX, vU, vZ; varying vec3 vC;
  ${COMMON}
  void main() {
    float rel = mod(aS.z + flow - camZ + (${WL.toFixed(1)} - ${MARGIN.toFixed(1)}), ${WL.toFixed(1)}) - (${WL.toFixed(1)} - ${MARGIN.toFixed(1)});
    vec3 A = vec3(cos(aS.x) * aS.y, sin(aS.x) * aS.y, camZ + rel);
    float len = 0.015 + speed * 0.055 * (0.6 + 0.8 * aS.w);
    vec3 B = A - vec3(0.0, 0.0, len);
    vec3 Av = (modelViewMatrix * vec4(A, 1.0)).xyz, Bv = (modelViewMatrix * vec4(B, 1.0)).xyz;
    vec3 mid = mix(Av, Bv, position.y);
    vec3 side = safeN(cross(Bv - Av, mid), vec3(1.0, 0.0, 0.0));
    float dist = max(-mid.z, 0.01);
    float W0 = 0.0007 + 0.0008 * aS.w;
    float w = max(W0, dist * pxA);
    float far = smoothstep(${(WL - MARGIN).toFixed(1)}, ${(WL * 0.45).toFixed(1)}, -rel);
    vI = (W0 / w) * far * (0.5 + aS.w);
    vX = position.x; vU = position.y; vZ = mix(A.z, B.z, position.y);
    vC = aS.w > 0.82 ? vec3(1.0, 0.78, 0.48) : (aS.w > 0.5 ? vec3(0.66, 0.76, 1.0) : vec3(0.95, 0.97, 1.0));
    gl_Position = projectionMatrix * vec4(mid + side * position.x * w, 1.0);
  }`;
const streakFrag = /* glsl */`
  uniform float clipZ, gain;
  varying float vI, vX, vU, vZ; varying vec3 vC;
  void main() {
    float a = vI * (1.0 - vX * vX) * (1.0 - vU) * (1.0 - smoothstep(clipZ - 0.08, clipZ, vZ));
    gl_FragColor = vec4(min(vC * a * gain, vec3(0.8)), 1.0);          // under the bloom's knee: sharp, no soft haze
  }`;

// ---------------------------------------------------------------- the panes of glass on the tunnel's walls: instanced
const paneVert = /* glsl */`
  attribute vec4 aP;                 // angle, radius, z0, length (along the tunnel)
  attribute vec4 aQ;                 // height, atlas cell, brightness, opacity
  attribute float aH;                // 0: bare glass; -1: a painting on the tunnel's wall; 1 + yaw: one of the two great panes
  uniform float flow, camZ, lensQ, heroFlow, bigOn;
  varying vec2 vUv, vLocal; varying float vI, vZ, vCell, vOp, vSmear;
  ${COMMON}
  void main() {
    float rel; vec3 rt, up, c;
    if (aH > 0.5) {
      // a great pane: big, upright, far out to the left or right (aP = x, y of its middle, z0, width), turned toward the tunnel's
      // middle by its yaw like a wall going away; it slides by slowly (it is big and far, so it moves at a part of the tunnel's
      // speed) and never wraps
      float yaw = aH - 1.0;
      rel = aP.z + ${HERO_K.toFixed(2)} * heroFlow - camZ;
      rt = vec3(cos(yaw), 0.0, sign(aP.x) * sin(yaw)); up = vec3(0.0, 1.0, 0.0);
      c = vec3(aP.x, aP.y, camZ + rel);
    } else {
      rel = mod(aP.z + flow - camZ + (${WL.toFixed(1)} - ${MARGIN.toFixed(1)}), ${WL.toFixed(1)}) - (${WL.toFixed(1)} - ${MARGIN.toFixed(1)});
      vec3 er = vec3(cos(aP.x), sin(aP.x), 0.0);
      up = vec3(-sin(aP.x), cos(aP.x), 0.0); if (up.y < -0.2) up = -up;
      rt = cross(er, up);                                // along the tunnel, so the picture reads the right way round
      c = er * aP.y + vec3(0.0, 0.0, camZ + rel);
    }
    vec3 p = c + rt * position.x * aP.w + up * position.y * aQ.x;
    vLocal = position.xy + 0.5;
    vec2 cell = vec2(mod(aQ.y, 2.0), floor(aQ.y / 2.0));
    vUv = vec2((cell.x + vLocal.x) / 2.0, 1.0 - (cell.y + 1.0 - vLocal.y) / ${ROWS.toFixed(1)});
    if (aH > 0.5) { vI = aQ.z * smoothstep(13.0, 9.0, -rel) * smoothstep(-1.5, 0.0, -rel); vSmear = ${HERO_K.toFixed(2)}; }
    else {
      float qc = aP.y / max(-rel, 0.05);              // where its middle is seen, against the lens
      vI = aQ.z * smoothstep(6.5, 2.4, -rel) * smoothstep(lensQ * 0.9, lensQ * 1.5, qc);        // the panes melt into the lens's light before they reach it
      vI *= mix(0.45, 1.0, smoothstep(0.3, 2.0, -rel));   // and go half to light as they rush past you (the trailer's smears, 47-49 s)
      vSmear = 1.0;
      if (aH < -0.5) vI *= bigOn;                      // the paintings on the walls come once the great panes have gone by
    }
    vZ = p.z; vCell = aQ.y; vOp = aQ.w;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }`;
const paneFrag = /* glsl */`
  uniform sampler2D atlas; uniform float clipZ, gain, fade, speed;
  varying vec2 vUv, vLocal; varying float vI, vZ, vCell, vOp, vSmear;
  void main() {
    // smeared along the tunnel as time rushes (five taps along the pane's length, kept inside its cell)
    bool shard = vCell > 7.5;          // bare glass: a crisp crystal shard (the trailer's), never smeared
    float sm = shard ? 0.0 : clamp(speed * vSmear * 0.010, 0.0, 0.16);
    vec3 pic = vec3(0.0);
    for (int k = 0; k < 5; k++) {
      float lx = clamp(vLocal.x + (float(k) / 4.0 - 0.5) * sm, 0.002, 0.998);
      pic += pow(texture2D(atlas, vec2(vUv.x + (lx - vLocal.x) * 0.5, vUv.y)).rgb, vec3(2.2));
    }
    pic *= 0.2;
    vec2 e = min(vLocal, 1.0 - vLocal);
    float edge = exp(-min(e.x * 3.0, e.y) / 0.012);                       // the glass's lit edge
    float soft = smoothstep(0.0, 0.04, e.x) * smoothstep(0.0, 0.025, e.y);
    if (shard) {
      soft = smoothstep(0.0, 0.012, e.x) * smoothstep(0.0, 0.012, e.y);
      pic = pic * 0.5 + vec3(0.10, 0.13, 0.20) + vec3(0.85, 0.92, 1.0) * pow(1.0 - abs(vLocal.x - vLocal.y), 6.0);   // a glint across the facet
      edge = exp(-min(e.x, e.y) / 0.03) * 1.6;
    }
    if (vSmear < 0.5) {             // a great pane (vSmear = their slow speed): the trailer's deep blacks, edges melting into the dark
      pic = pow(pic, vec3(1.25)) * 0.8;
      soft = smoothstep(0.0, 0.10, e.x) * smoothstep(0.0, 0.07, e.y);
      edge *= 0.15;
    }
    float a = clamp(vI * (1.0 - smoothstep(clipZ - 0.08, clipZ, vZ)) * soft * vOp * fade, 0.0, 1.0);
    vec3 c = pic * gain + vec3(1.0, 0.92, 0.76) * edge * 0.7;
    gl_FragColor = vec4(c * a, a);                                        // premultiplied: the pictures sit on the dark, not in it
  }`;

// ---------------------------------------------------------------- full screen: the warp's picture, through the grade's inverse
const blitVert = /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const blitFrag = /* glsl */`
  uniform sampler2D tWarp; uniform float glow;
  varying vec2 vUv;
  ${UNGRADE_GLSL}
  ${UNGRADE_HDR}
  void main() {
    vec3 k = texture2D(tWarp, vUv).rgb;
    if (!(max(k.r, max(k.g, k.b)) < 6.0e4) || !(min(k.r, min(k.g, k.b)) > -1.0)) k = vec3(0.0);
    gl_FragColor = vec4(ungradeHDR(k * glow), 1.0);
  }`;

// ---------------------------------------------------------------- the past, painted once at load (2 x 4 cells, 512 x 256)
// Little oil-like paintings in the trailer's warm, saturated light: deep gradients, lit and shadowed faces, glows, haze and a
// painterly grain, so they read as pictures of other times flying past, not flat shapes.
function paintAtlas() {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 256 * ROWS;
  const g = c.getContext('2d');
  const W = 512, H = 256;
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const cell = (i, fn) => { g.save(); g.translate((i % 2) * W, Math.floor(i / 2) * H); g.beginPath(); g.rect(0, 0, W, H); g.clip(); fn(); grain(); g.restore(); };
  const lin = (x0, y0, x1, y1, stops) => { const lg = g.createLinearGradient(x0, y0, x1, y1); stops.forEach(([o, col]) => lg.addColorStop(o, col)); return lg; };
  const sky = (stops) => { g.fillStyle = lin(0, 0, 0, H, stops); g.fillRect(0, 0, W, H); };
  const glow = (x, y, r, col, a = 1) => { const rg = g.createRadialGradient(x, y, 0, x, y, r); rg.addColorStop(0, col); rg.addColorStop(1, 'rgba(0,0,0,0)'); g.globalAlpha = a; g.fillStyle = rg; g.fillRect(x - r, y - r, r * 2, r * 2); g.globalAlpha = 1; };
  const poly = (pts, fill) => { g.fillStyle = fill; g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (const p of pts.slice(1)) g.lineTo(p[0], p[1]); g.closePath(); g.fill(); };
  // brush strokes: short soft dabs of a colour along a band, for clouds, sand, water
  const dabs = (n, x0, y0, x1, y1, cols, w = 30, h = 4) => { for (let i = 0; i < n; i++) { g.globalAlpha = 0.08 + rnd() * 0.18; g.fillStyle = cols[Math.floor(rnd() * cols.length)];
    const x = x0 + rnd() * (x1 - x0), y = y0 + rnd() * (y1 - y0); g.beginPath(); g.ellipse(x, y, w * (0.4 + rnd()), h * (0.5 + rnd()), 0, 0, 7); g.fill(); } g.globalAlpha = 1; };
  const grain = () => { for (let i = 0; i < 2600; i++) { g.fillStyle = rnd() < 0.5 ? 'rgba(255,240,210,0.05)' : 'rgba(20,10,0,0.07)'; g.fillRect(rnd() * W, rnd() * H, 2, 2); } };
  const stars = (n, y1) => { for (let i = 0; i < n; i++) { g.fillStyle = `rgba(235,240,255,${0.35 + rnd() * 0.6})`; const s = rnd() < 0.1 ? 2.2 : 1.2; g.fillRect(rnd() * W, rnd() * y1, s, s); } };

  // 0: the pyramid at sunset, a figure sitting before it in the gold
  cell(0, () => {
    sky([[0, '#ffd56e'], [0.35, '#f7a531'], [0.7, '#c9601a'], [1, '#5a2206']]);
    glow(230, 92, 200, 'rgba(255,236,160,0.9)');
    g.fillStyle = '#fff6cc'; g.beginPath(); g.arc(230, 92, 40, 0, 7); g.fill();
    dabs(60, 0, 40, W, 130, ['#ffe7a0', '#f4a03a', '#ffcf70'], 40, 3);
    // far dunes, then the pyramid: its sunlit face gold, its shadow face deep umber, a lit edge
    poly([[0, 190], [120, 172], [260, 184], [400, 168], [512, 180], [512, 256], [0, 256]], '#8a3c0e');
    poly([[100, 200], [262, 60], [430, 200]], '#3a1806');
    poly([[262, 60], [430, 200], [300, 200]], lin(262, 60, 380, 200, [[0, '#f6c063'], [1, '#a5541a']]));
    g.strokeStyle = 'rgba(255,240,190,0.85)'; g.lineWidth = 2; g.beginPath(); g.moveTo(262, 60); g.lineTo(300, 200); g.stroke();
    for (let i = 1; i < 9; i++) { g.strokeStyle = 'rgba(70,30,6,0.35)'; g.lineWidth = 1; const y = 60 + i * 15.5; g.beginPath(); g.moveTo(262 + (i * 15.5) * (38 / 140) , y); g.lineTo(262 + (i * 15.5) * (168 / 140), y); g.stroke(); }
    // the near sand, raked by the low sun, and the seated figure
    g.fillStyle = lin(0, 196, 0, 256, [[0, '#c8742a'], [1, '#4a1e06']]); g.fillRect(0, 196, W, 60);
    dabs(140, 0, 198, W, 256, ['#ffcc7a', '#e08a3a', '#6a2a08'], 26, 2);
    g.fillStyle = '#1c0a02'; g.beginPath(); g.arc(448, 176, 7.5, 0, 7); g.fill();
    g.beginPath(); g.moveTo(432, 214); g.quadraticCurveTo(436, 186, 448, 183); g.quadraticCurveTo(462, 186, 466, 214); g.fill();
    g.strokeStyle = 'rgba(255,214,140,0.8)'; g.lineWidth = 1.5; g.beginPath(); g.arc(448, 176, 7.5, -1.9, -0.4); g.stroke();
    glow(256, 200, 260, 'rgba(255,170,60,0.25)');
  });
  // 1: a full moon behind a dark tower, lamp-lit windows
  cell(1, () => {
    sky([[0, '#070b1c'], [0.6, '#16244a'], [1, '#2b3a66']]);
    stars(90, 200);
    const mx = 300, my = 112, mr = 88;
    glow(mx, my, 190, 'rgba(255,240,205,0.45)');
    g.fillStyle = lin(mx - mr, my - mr, mx + mr, my + mr, [[0, '#fffaf0'], [0.6, '#f0e2c0'], [1, '#c9b48a']]); g.beginPath(); g.arc(mx, my, mr, 0, 7); g.fill();
    for (let i = 0; i < 34; i++) { const a = rnd() * 7, rr = Math.sqrt(rnd()) * mr * 0.85; const x = mx + Math.cos(a) * rr, y = my + Math.sin(a) * rr, s = 3 + rnd() * 13;
      g.fillStyle = `rgba(140,118,84,${0.18 + rnd() * 0.22})`; g.beginPath(); g.arc(x, y, s, 0, 7); g.fill(); g.strokeStyle = 'rgba(255,250,235,0.35)'; g.lineWidth = 1; g.beginPath(); g.arc(x + 1, y + 1, s, 3.6, 5.6); g.stroke(); }
    g.fillStyle = 'rgba(20,24,50,0.35)'; g.beginPath(); g.arc(mx + 26, my + 10, mr, -1.0, 1.9); g.arc(mx, my, mr, 1.6, -1.2, true); g.fill();
    // the tower: spire, belfry, body, a warm lamp in its windows and a lit edge from the moon
    const T = '#06070e';
    poly([[296, 6], [306, 6], [312, 40], [290, 40]], T); g.fillStyle = T; g.fillRect(284, 40, 34, 70); g.fillRect(276, 108, 50, 12);
    poly([[262, 256], [270, 120], [332, 120], [340, 256]], T);
    g.fillStyle = 'rgba(255,214,120,0.95)'; g.fillRect(293, 64, 16, 22); glow(301, 75, 40, 'rgba(255,190,90,0.6)');
    for (const [x, y] of [[282, 150], [310, 150], [282, 196], [310, 196]]) { g.fillStyle = 'rgba(255,200,110,0.9)'; g.fillRect(x, y, 10, 16); glow(x + 5, y + 8, 22, 'rgba(255,180,80,0.4)'); }
    g.strokeStyle = 'rgba(240,230,200,0.75)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(318, 40); g.lineTo(318, 108); g.moveTo(332, 120); g.lineTo(340, 256); g.stroke();
    dabs(40, 0, 210, W, 256, ['#1a2448', '#2a3a6a'], 40, 4);
  });
  // 2: the stone pillar, a carved T of stone against a rose and amber dusk
  cell(2, () => {
    sky([[0, '#ffc27a'], [0.45, '#ef8a4a'], [0.75, '#a2405a'], [1, '#3a1430']]);
    glow(120, 160, 160, 'rgba(255,220,150,0.8)'); g.fillStyle = '#fff0c8'; g.beginPath(); g.arc(120, 160, 24, 0, 7); g.fill();
    dabs(70, 0, 30, W, 150, ['#ffd09a', '#f59a62', '#d06a6a'], 50, 4);
    poly([[0, 214], [90, 196], [200, 206], [330, 190], [512, 204], [512, 256], [0, 256]], '#2a0e20');
    // the pillar: lit face toward the sun, carved animal and arm in relief
    g.fillStyle = '#2a1410'; g.fillRect(272, 96, 50, 160); g.fillRect(236, 70, 122, 34);
    g.fillStyle = lin(236, 0, 300, 0, [[0, '#d9864e'], [1, '#5a2a1a']]); g.fillRect(236, 70, 40, 34); g.fillRect(272, 104, 14, 152);
    g.strokeStyle = 'rgba(255,190,130,0.7)'; g.lineWidth = 2; g.beginPath(); g.moveTo(292, 136); g.lineTo(310, 150); g.lineTo(292, 164); g.moveTo(290, 190); g.lineTo(314, 190); g.lineTo(314, 226); g.stroke();
    g.fillStyle = '#20100c'; g.fillRect(392, 150, 26, 106); g.fillRect(378, 138, 56, 18);
    glow(256, 230, 280, 'rgba(255,140,80,0.18)');
  });
  // 3: a tall ship under the moon, a gold road on the sea
  cell(3, () => {
    sky([[0, '#0a1230'], [0.6, '#2a3c74'], [0.62, '#16224a'], [1, '#060a1a']]);
    stars(70, 150);
    glow(392, 60, 120, 'rgba(255,236,190,0.6)'); g.fillStyle = '#fff4d8'; g.beginPath(); g.arc(392, 60, 22, 0, 7); g.fill();
    for (let i = 0; i < 40; i++) { const y = 162 + i * 2.3, w = 6 + i * 1.6 + rnd() * 20; g.fillStyle = `rgba(255,214,140,${0.65 - i * 0.012})`; g.fillRect(392 - w / 2 + (rnd() - 0.5) * 14, y, w, 1.6); }
    dabs(90, 0, 162, W, 256, ['#2a3e7a', '#0c1430', '#4a5a9a'], 30, 2);
    const S = '#04060e';
    poly([[110, 158], [310, 158], [292, 184], [130, 184]], S);
    g.fillStyle = S; g.fillRect(178, 54, 4, 104); g.fillRect(236, 40, 4, 118); g.fillRect(128, 150, 190, 4);
    for (const [x, t, b, w] of [[182, 60, 150, 36], [240, 46, 150, 44], [178, 74, 146, -30]]) { g.fillStyle = 'rgba(30,36,70,0.95)'; g.beginPath(); g.moveTo(x, t); g.quadraticCurveTo(x + w, (t + b) / 2, x, b); g.fill();
      g.strokeStyle = 'rgba(255,230,180,0.55)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x, t); g.quadraticCurveTo(x + w, (t + b) / 2, x, b); g.stroke(); }
    g.fillStyle = 'rgba(255,200,110,0.9)'; for (let i = 0; i < 6; i++) g.fillRect(150 + i * 24, 166, 5, 4);
  });
  // 4: the columns of a temple in hot morning gold
  cell(4, () => {
    sky([[0, '#ffe7a8'], [0.5, '#f5b45a'], [1, '#b0601e']]);
    glow(420, 50, 180, 'rgba(255,250,210,0.8)');
    poly([[86, 76], [256, 26], [426, 76]], '#6a3a14'); poly([[256, 26], [426, 76], [256, 76]], '#a8642a');
    g.fillStyle = '#7a4418'; g.fillRect(86, 76, 340, 18); g.fillStyle = 'rgba(255,230,170,0.6)'; g.fillRect(86, 76, 340, 3);
    for (let i = 0; i < 6; i++) { const x = 102 + i * 56; g.fillStyle = lin(x, 0, x + 26, 0, [[0, '#ffe2a6'], [0.35, '#d08a40'], [1, '#5a2e0e']]); g.fillRect(x, 94, 26, 130);
      g.fillStyle = 'rgba(60,28,6,0.35)'; for (let k = 0; k < 4; k++) g.fillRect(x + 5 + k * 5, 94, 1.5, 130); }
    g.fillStyle = '#6a3410'; g.fillRect(70, 224, 372, 10); g.fillStyle = '#4a220a'; g.fillRect(54, 234, 404, 22);
    dabs(60, 0, 228, W, 256, ['#ffd08a', '#8a4a18'], 30, 3);
  });
  // 5: a brass clock face: time passing
  cell(5, () => {
    sky([[0, '#140c24'], [1, '#3a2240']]);
    const x = 256, y = 128, R = 106;
    glow(x, y, 190, 'rgba(255,200,120,0.4)');
    g.fillStyle = lin(x - R, y - R, x + R, y + R, [[0, '#ffe2a0'], [0.5, '#c88a3a'], [1, '#6a4010']]); g.beginPath(); g.arc(x, y, R, 0, 7); g.fill();
    g.fillStyle = lin(x, y - R, x, y + R, [[0, '#fff6dc'], [1, '#e2cc98']]); g.beginPath(); g.arc(x, y, R - 12, 0, 7); g.fill();
    g.strokeStyle = '#2a1806';
    for (let i = 0; i < 60; i++) { const a = i / 60 * Math.PI * 2, l = i % 5 ? 6 : 15; g.lineWidth = i % 5 ? 1.5 : 4; g.beginPath(); g.moveTo(x + Math.sin(a) * (R - 18), y - Math.cos(a) * (R - 18)); g.lineTo(x + Math.sin(a) * (R - 18 - l), y - Math.cos(a) * (R - 18 - l)); g.stroke(); }
    g.lineCap = 'round'; g.lineWidth = 7; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 44, y - 28); g.stroke();
    g.lineWidth = 4; g.beginPath(); g.moveTo(x, y); g.lineTo(x - 16, y - 76); g.stroke();
    g.fillStyle = '#2a1806'; g.beginPath(); g.arc(x, y, 7, 0, 7); g.fill();
    glow(x - 40, y - 50, 70, 'rgba(255,255,240,0.35)');
  });
  // 6, 7: the pillar and the ship again; 8, 9: bare glass, lit warm and cool
  for (const [to, from] of [[6, 2], [7, 3]]) g.drawImage(c, (from % 2) * W, Math.floor(from / 2) * H, W, H, (to % 2) * W, Math.floor(to / 2) * H, W, H);
  cell(8, () => { g.fillStyle = lin(0, 0, W, H, [[0, '#fff0c4'], [0.45, '#f0a840'], [1, '#7a3c0e']]); g.fillRect(0, 0, W, H); dabs(30, 0, 0, W, H, ['#fff6d8'], 80, 6); });
  cell(9, () => { g.fillStyle = lin(0, 0, W, H, [[0, '#eef4ff'], [0.5, '#8ea6ec'], [1, '#22306a']]); g.fillRect(0, 0, W, H); dabs(30, 0, 0, W, H, ['#ffffff'], 80, 6); });
  return c;
}

// ---------------------------------------------------------------- the timeline (shared by js/ending.js and lab/warp.html)
export const THROUGH = 9.0;          // the pull's second you are through the glass: the warp goes full screen
export const WARP_LEN = 6.0;         // how long the warp runs, through to white
const sm = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
// the draw-in (0..1 over pull 5.6 s to THROUGH): quick at first, so the glass nearly fills the frame by 7.25 s, as the trailer
// has it at 45 s; it starts and ends at rest (js/ending.js goes in by ratios of this)
export function drawIn(x) { return Math.pow(sm(x), 0.8); }
// how fast time rushes past (m/s down the tunnel) at second t of the pull: slow through the glass, then hard once in it
export function warpSpeed(t) {
  const tw = t - THROUGH;
  return tw < 0 ? 0.25 + 1.6 * sm((t - 1.0) / 7.5) : 1.85 + 10.0 * sm(tw / 3.4) + 4.0 * sm((tw - 3.4) / 2.0);
}
// the look at tw seconds after THROUGH (negative: still in the arcade), glassQ = the glass's half-height over your distance
export function warpLook(tw, glassQ, speed) {
  // the far lens: at first a part of the glass (as big as the trailer has it at 45 s), then held, like the stars, at infinity
  const L0 = 0.62 * Math.tanh(0.45 * glassQ / 0.62);
  const rush = sm(tw / 2.6), bloom = Math.pow(sm((tw - 3.2) / 2.65), 1.4);
  const lensQ = (L0 + 0.32 * rush) * (1 + 0.3 * bloom * bloom);      // the white burst takes over from it, round, not a diamond
  const pass = tw > 0 ? Math.min(tw / 3.0, 0.93) : 0;          // THE GATE's rings come at you and go by
  // the white burst's reach (view-ray units: the frame's edge is ~1.3 up, ~2.4 across): an oval over the lens by 4.4 s (the trailer, 50 s),
  // a large one by 5.2 s (51 s), most of the frame by 5.8 s with the stars still streaking at the edges (51.7 s), the whole frame only at 5.9-6.0 s
  const burst = tw < 3.4 ? 0 : 0.55 * Math.exp((tw - 4.4) * 0.7) * sm((tw - 3.4) / 1.0) + 0.6 * sm((tw - 5.8) / 0.2);
  return { speed, lensQ, burst, ringQ: 1.22 * L0 / (1 - pass), ringA: 1 - sm((tw - 1.7) / 1.2), bloom, beam: 1 - bloom * 0.6, bigOn: sm((tw - 0.7) / 1.0),
    streakLen: Math.min(0.95, 0.28 + 0.06 * speed), density: 1 };
}

// where the pull's camera stands (m from the glass) and its lens, at second t of the pull: js/ending.js updatePull's dolly-zoom,
// then in (linesEnd: when the last line left; 17.5 with no recordings)
const DEG = Math.PI / 180;
const easeIO = (x) => { x = Math.min(1, Math.max(0, x)); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
export function pullCamera(t, linesEnd = 17.5) {
  const fov0 = 60, fov1 = 106, d0 = 0.95 - linesEnd * 0.004;
  const fov = fov0 + (fov1 - fov0) * easeIO((t - 0.6) / 5.0);
  const dz = d0 * Math.tan(fov0 * DEG / 2) / Math.tan(fov * DEG / 2);
  return { d: dz * Math.pow(0.045 / dz, drawIn((t - 5.6) / (THROUGH - 5.6))), fov };
}
// the tunnel's flow when the pull starts (the glimpse's 3.5 s at 0.25 m/s) and at second t of it, stepped at 60 Hz as a frame does
export const PULL_FLOW0 = 3.5 * 0.25;
export function pullFlow(t) { let f = PULL_FLOW0, s = 0; const dt = 1 / 60; while (s + dt < t) { s += dt; f += warpSpeed(s) * dt; } return f; }

// The streaks and panes, placed once (seeded, so the picture and the sound agree). The first two panes are the great ones that
// frame the screen at 7.25 s as the trailer has them at 45.2 s: the pyramid on the left, the moon on the right, upper middle,
// tall walls running into the distance; they then slide out past the edges as you are drawn in (the trailer, 45-48 s).
const HERO_T = 7.25, HERO_CAMZ = 0.117;          // the moment they frame the screen, and where the camera stands then
const HEROES = [            // x, y of the middle (m), its depth at HERO_T (m), width, height, atlas cell, yaw (0 faces you)
  [-4.72, 1.66, 3.0, 3.72, 2.87, 0, 0.20],
  [5.03, 1.52, 3.0, 3.05, 3.76, 1, 0.20],
];
let LAYOUT = null;
export function paneLayout() {
  if (LAYOUT) return LAYOUT;
  let seed = 12345; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const NS = 2600, sa = new Float32Array(NS * 4);
  for (let i = 0; i < NS; i++) { sa[i * 4] = rnd() * Math.PI * 2; sa[i * 4 + 1] = 0.12 + Math.pow(rnd(), 0.7) * 1.5; sa[i * 4 + 2] = rnd() * WL; sa[i * 4 + 3] = rnd(); }
  const NHERO = HEROES.length, NB = 16, NSH = 110, NP = NHERO + NB + NSH;
  const pa = new Float32Array(NP * 4), pq = new Float32Array(NP * 4), ph = new Float32Array(NP);
  const flowAtHero = pullFlow(HERO_T);
  HEROES.forEach(([x, y, D, wd, h, cell, yaw], i) => {
    pa.set([x, y, HERO_CAMZ - D - HERO_K * flowAtHero, wd], i * 4); pq.set([h, cell, 1.0, 0.97], i * 4); ph[i] = 1 + yaw;
  });
  // the big panes sit on the left and right walls, mostly (as in the trailer); a few above and below. They hold the worlds ahead
  // (cells 2-7); the small ones are bare lit glass
  const sideAngles = [Math.PI * 0.97, 0.03, Math.PI * 1.08, -0.1, Math.PI * 0.88, 0.14, Math.PI * 0.62, Math.PI * 1.38];
  const bigCells = [2, 3, 4, 5, 6, 7];
  for (let j = 0; j < NB + NSH; j++) {
    const i = NHERO + j, big = j < NB;
    pa[i * 4] = big ? sideAngles[j % sideAngles.length] + (rnd() - 0.5) * 0.12 : rnd() * Math.PI * 2;
    pa[i * 4 + 1] = big ? 0.62 + rnd() * 0.25 : 0.5 + rnd() * 0.9;
    pa[i * 4 + 2] = big ? (j / NB) * WL + rnd() * 0.4 : rnd() * WL;
    pa[i * 4 + 3] = big ? 0.9 + rnd() * 0.5 : 0.07 + rnd() * 0.22;
    pq[i * 4] = big ? pa[i * 4 + 3] * 0.42 : 0.03 + rnd() * 0.08;
    pq[i * 4 + 1] = big ? bigCells[j % bigCells.length] : 8 + (rnd() < 0.6 ? 0 : 1);
    pq[i * 4 + 2] = big ? 0.9 : 0.45 + rnd() * 0.7;
    pq[i * 4 + 3] = big ? 0.94 : 0.5;              // opacity: the past is solid, bare glass half seen
    ph[i] = big ? -1 : 0;
  }
  return (LAYOUT = { NS, sa, NP, NHERO, NB, pa, pq, ph });
}

// When things fly past you, in pull seconds, for the sound (js/warp_sound.js): each big pane as it crosses you (side -1 left,
// +1 right, by the wall it is on), the two great panes as they slide out past the frame's edges, THE GATE's rings as they go
// past the frame (their size reaches the frame's edge at about 1.3-2.1 s after THROUGH).
export function warpFlyBys(linesEnd = 17.5) {
  const L = paneLayout(), out = [];
  const dt = 1 / 120, end = THROUGH + WARP_LEN;
  let flow = PULL_FLOW0;
  const prev = new Float32Array(L.NP).fill(-1);
  for (let t = 0; t < end; t += dt) {
    flow += warpSpeed(t) * dt;
    const camZ = t < THROUGH ? pullCamera(t, linesEnd).d : 0.045;
    for (let i = 0; i < L.NHERO + L.NB; i++) {
      const a = L.pa[i * 4], z0 = L.pa[i * 4 + 2];
      let rel; const great = L.ph[i] > 0.5;
      if (great) rel = z0 + HERO_K * flow - camZ + 1.2;              // the great panes: as their middle comes within 1.2 m
      else rel = ((z0 + flow - camZ + (WL - MARGIN)) % WL + WL) % WL - (WL - MARGIN);
      if (prev[i] < 0 && rel >= 0 && rel - prev[i] < 1.0) out.push({ t: +t.toFixed(3), side: great ? Math.sign(a) : Math.sign(Math.cos(a)) || 1, kind: great ? 'great' : 'pane' });
      prev[i] = rel;
    }
  }
  out.push({ t: THROUGH + 1.7, side: 0, kind: 'rings' });
  return out.sort((a, b) => a.t - b.t);
}

export class Warp {
  constructor(renderer, grade) {
    this.r = renderer;
    this.scene = new THREE.Scene();
    this.cam = new THREE.PerspectiveCamera(60, 16 / 9, 0.005, 60);
    this.rt = null;
    this.flow = 0;
    const shared = { flow: { value: 0 }, camZ: { value: 0 }, speed: { value: 0 }, clipZ: { value: 0 } };
    this.shared = shared;
    // background
    this.bgU = {
      invProj: { value: new THREE.Matrix4() }, camWorld: { value: new THREE.Matrix4() },
      time: { value: 0 }, flowT: { value: 0 }, speed: shared.speed, lensQ: { value: 0.3 }, ringQ: { value: 0.4 }, ringA: { value: 1 },
      bloom: { value: 0 }, beam: { value: 1 }, streakLen: { value: 0.1 }, density: { value: 1 }, burst: { value: 0 },
    };
    const bg = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
      vertexShader: bgVert, fragmentShader: bgFrag, uniforms: this.bgU, depthTest: false, depthWrite: false, blending: THREE.NoBlending }));
    bg.frustumCulled = false; bg.renderOrder = 0; bg.material.name = 'M_WarpSpace'; this.scene.add(bg);
    // streaks and panes: where each one sits (paneLayout, shared with warpFlyBys so the sound knows when they pass)
    const L = paneLayout();
    const sg = new THREE.InstancedBufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, 0, 0, 1, 0, 0, 1, 1, 0, -1, 1, 0]), 3));
    sg.setIndex([0, 1, 2, 0, 2, 3]);
    sg.setAttribute('aS', new THREE.InstancedBufferAttribute(L.sa, 4));
    sg.instanceCount = L.NS;
    this.streakU = { ...shared, pxA: { value: 0.001 }, nearFade: { value: 0 }, gain: { value: 0.8 } };
    const streaks = new THREE.Mesh(sg, new THREE.ShaderMaterial({ vertexShader: streakVert, fragmentShader: streakFrag, uniforms: this.streakU,
      depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, transparent: true }));
    streaks.frustumCulled = false; streaks.renderOrder = 2; streaks.material.name = 'M_WarpStreaks'; this.scene.add(streaks);
    // panes: the paintings (our art, loaded; the canvas paintings until it comes, or if it never does)
    this.atlasCanvas = paintAtlas();
    this.atlas = new THREE.CanvasTexture(this.atlasCanvas); this.atlas.generateMipmaps = true; this.atlas.minFilter = THREE.LinearMipmapLinearFilter; this.atlas.anisotropy = 4;
    this.atlasSource = 'canvas';
    try {
      new THREE.TextureLoader().load(PANES_URL, (tex) => {
        tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.anisotropy = 4;     // colour stays raw: the shader linearizes
        this.paneU.atlas.value = tex; this.atlasSource = 'art';
        try { this.r.initTexture(tex); } catch (e) { /* uploaded on first use */ }
      }, undefined, () => { console.warn('[warp] pane paintings did not load; the canvas paintings stay'); });
    } catch (e) { /* the canvas paintings stay */ }
    const pg = new THREE.InstancedBufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]), 3));
    pg.setIndex([0, 1, 2, 0, 2, 3]);
    pg.setAttribute('aP', new THREE.InstancedBufferAttribute(L.pa, 4));
    pg.setAttribute('aQ', new THREE.InstancedBufferAttribute(L.pq, 4));
    pg.setAttribute('aH', new THREE.InstancedBufferAttribute(L.ph, 1));
    pg.instanceCount = L.NP;
    this.paneU = { ...shared, atlas: { value: this.atlas }, gain: { value: 1.0 }, fade: { value: 1.0 }, lensQ: this.bgU.lensQ, heroFlow: { value: PULL_FLOW0 }, bigOn: { value: 1 } };
    const panes = new THREE.Mesh(pg, new THREE.ShaderMaterial({ vertexShader: paneVert, fragmentShader: paneFrag, uniforms: this.paneU,
      depthTest: false, depthWrite: false, transparent: true, side: THREE.DoubleSide,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor }));
    panes.frustumCulled = false; panes.renderOrder = 1; panes.material.name = 'M_WarpPanes'; this.scene.add(panes);
    // the full-screen blit (main.js renders this scene in place of the arcade once you are through the glass)
    this.blitU = { tWarp: { value: null }, glow: { value: 1 }, ...grade };
    const bq = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ vertexShader: blitVert, fragmentShader: blitFrag, uniforms: this.blitU,
      depthTest: false, depthWrite: false }));
    bq.frustumCulled = false; bq.material.name = 'M_WarpBlit';
    this.blitScene = new THREE.Scene(); this.blitScene.add(bq);
    this.blitCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }
  get texture() { return this.rt ? this.rt.texture : null; }
  // the state of the warp, set each frame by js/ending.js
  set(o) {
    const u = this.bgU;
    if (o.speed !== undefined) this.shared.speed.value = o.speed;
    if (o.flow !== undefined) { this.flow = o.flow; this.shared.flow.value = o.flow; u.flowT.value = o.flow; }
    if (o.heroFlow !== undefined && Number.isFinite(o.heroFlow)) this.paneU.heroFlow.value = o.heroFlow;
    if (o.bigOn !== undefined && Number.isFinite(o.bigOn)) this.paneU.bigOn.value = o.bigOn;
    if (o.time !== undefined) u.time.value = o.time;
    for (const k of ['lensQ', 'ringQ', 'ringA', 'bloom', 'beam', 'streakLen', 'density', 'burst']) if (o[k] !== undefined && Number.isFinite(o[k])) u[k].value = o[k];
    if (o.clipZ !== undefined) this.shared.clipZ.value = o.clipZ;
    if (o.bloom !== undefined && Number.isFinite(o.bloom)) this.paneU.fade.value = 1 - sm(o.bloom / 0.6);       // the light takes the panes first
    if (o.glow !== undefined) this.blitU.glow.value = o.glow;
  }
  // camera: { position (warp frame), quaternion (warp frame), fov, aspect }
  render(pose, w, h) {
    w = Math.max(16, w | 0); h = Math.max(16, h | 0);
    if (!this.rt || this.rt.width !== w || this.rt.height !== h) {
      if (this.rt) this.rt.dispose();
      this.rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
      this.blitU.tWarp.value = this.rt.texture;
    }
    const c = this.cam;
    c.position.copy(pose.position); c.quaternion.copy(pose.quaternion);
    if (c.fov !== pose.fov || c.aspect !== pose.aspect) { c.fov = pose.fov; c.aspect = pose.aspect; c.updateProjectionMatrix(); }
    c.updateMatrixWorld(true);
    this.bgU.invProj.value.copy(c.projectionMatrixInverse); this.bgU.camWorld.value.copy(c.matrixWorld);
    this.shared.camZ.value = c.position.z;
    this.streakU.pxA.value = 1.4 * 2 * Math.tan(c.fov * Math.PI / 360) / h;
    const prev = this.r.getRenderTarget();
    this.r.setRenderTarget(this.rt); this.r.render(this.scene, c); this.r.setRenderTarget(prev);
  }
  // at load: compile everything and draw it once small, so the first frame of the warp costs nothing new
  warm(w = 64, h = 36, target = null) {
    this.r.initTexture(this.paneU.atlas.value);
    this.render({ position: new THREE.Vector3(0, 0, 0.5), quaternion: new THREE.Quaternion(), fov: 60, aspect: w / h }, w, h);
    const prev = this.r.getRenderTarget();
    // the blit is drawn into the pipeline's HDR target (programs are keyed on the target): drawn there once, now
    this.r.setRenderTarget(target); this.r.render(this.blitScene, this.blitCam);
    this.r.setRenderTarget(prev);
  }
}
