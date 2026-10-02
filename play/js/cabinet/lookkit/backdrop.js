// lookkit/backdrop.js — a full-frame background layer (dim painted rock, floor light) under the lines.
//
//   new Backdrop({ frame:[w,h], map, uniforms, shade })
//       map      a THREE.Texture (e.g. a CanvasTexture drawn once at load); sampled as `tex` in shade()
//       uniforms extra uniforms (animate them: firelight, flicker)
//       shade    GLSL body of `vec3 shade(vec2 f, vec2 uv, vec4 tex)`; f = frame coords (x right, y down)
//     backdrop.object -> add first to the kit scene; backdrop.uniforms.<name>.value = ...
//   Output is HDR linear light; keep it dim (0.05 - 0.6) so the lines own the glow.
import * as THREE from 'three';

export class Backdrop {
  constructor(o = {}) {
    const [W, H] = o.frame ?? [1024, 768];
    const g = new THREE.PlaneGeometry(W, H);
    g.translate(W / 2, -H / 2, -1);
    this.uniforms = Object.assign({ map: { value: o.map ?? null }, frame: { value: new THREE.Vector2(W, H) } }, o.uniforms ?? {});
    const decl = Object.entries(o.uniforms ?? {}).map(([k, u]) => {
      const v = u.value;
      const type = typeof v === 'number' ? 'float' : v.isVector2 ? 'vec2' : v.isVector3 || v.isColor ? 'vec3' : v.isVector4 ? 'vec4' : v.isTexture ? 'sampler2D' : 'float';
      return `uniform ${type} ${k};`;
    }).join('\n');
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: /* glsl */`
        uniform sampler2D map; uniform vec2 frame; ${decl}
        varying vec2 vUv;
        vec3 shade(vec2 f, vec2 uv, vec4 tex) { ${o.shade ?? 'return tex.rgb;'} }
        void main() {
          vec2 uv = vUv;
          vec2 f = vec2(uv.x, 1.0 - uv.y) * frame;
          gl_FragColor = vec4(shade(f, vec2(uv.x, 1.0 - uv.y), texture2D(map, uv)), 1.0);
        }`,
      depthTest: false, depthWrite: false,
    });
    this.object = new THREE.Mesh(g, this.material);
    this.object.renderOrder = -10;
    this.object.frustumCulled = false;
  }
}
