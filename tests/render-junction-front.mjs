// The landing page's backdrop (assets/scene.webp / scene.jpg): THE JUNCTION front-on, rendered from the game in play/ at night.
// The camera stands in the street on the sign's centre line (x 82) and looks straight at the front; the street's other
// buildings, the pole and its wires are hidden (everything outside x 73.8..90.5) and the moon is turned away, so the art
// is symmetric about its middle. Run on Atlas only (atlas-run serves this folder):
//   atlas-run . tests/render-junction-front.mjs <out> '{"w":3840,"h":2400,"moonAway":1,"keep":[73.8,90.5,-140],"views":[["a",[82,-33.6,-150],[82,-33.6,-166]]]}'
// Then, on thor (the sides below the roofline fade to the page's colour; 3200x2000):
//   magick -size 3840x2400 xc:white -fill black -draw "rectangle 0,860 790,2400" -draw "rectangle 3050,860 3840,2400" -blur 0x110 mask.png
//   magick <out>/a.png mask.png -alpha off -compose CopyOpacity -composite -background '#07060a' -alpha remove -alpha off -resize 3200x2000 front.png
//   magick front.png -strip -quality 78 -define webp:method=6 assets/scene.webp
//   magick front.png -strip -interlace JPEG -quality 80 -sampling-factor 4:2:0 assets/scene.jpg
// Args (JSON): w, h (viewport), views [[name, eye, target]], keep [x0, x1, zmin] (hide the rest), moonAway, fov.
import { chromium } from 'playwright-core';
import fs from 'node:fs/promises';
const out = process.env.OUT_DIR, base = process.env.SITE_URL;
await fs.mkdir(out, { recursive: true });
const args = JSON.parse(process.argv[2] || '{}');
const W = args.w || 1920, H = args.h || 1080;
const VIEWS = args.views || [['a', [82, -33.6, -150], [82, -33.6, -166]]];
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM, args: ['--use-gl=angle', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=vulkan', '--autoplay-policy=no-user-gesture-required'] });
const p = await browser.newPage({ viewport: { width: W, height: H } });
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.goto(base + '/play/#basement');
await p.waitForFunction(() => window.__node && window.__node.state.state === 'title', null, { timeout: 120000 });
await p.evaluate(() => { window.__node.begin(); window.__node.skipIntro(); });
await p.waitForFunction(() => window.__node.state.state === 'play' && window.__node.state.warm && window.__node.state.outside, null, { timeout: 180000 });
await p.evaluate(() => window.__node.goOut());
await p.waitForFunction(() => window.__node.state.region === 'out', null, { timeout: 20000 });
// stand in the street at the foot of the hill so the night comes on, off to the side of every view
await p.evaluate(() => window.__node.warp(66, -36.6, -160, 0));
await p.waitForTimeout(6000);
await p.evaluate(() => { for (const id of ['hud', 'prompt', 'line']) { const e = document.getElementById(id); if (e) e.style.visibility = 'hidden'; } });
if (args.fov) await p.evaluate((f) => window.__node.lens(0.05, f), args.fov);
if (args.keep) {
  const r = await p.evaluate(([x0, x1, zmin]) => {
    const { THREE, camera } = window.__node.internals();
    let root = camera; while (root.parent) root = root.parent;
    const box = new THREE.Box3(), hid = [], kept = [];
    root.updateMatrixWorld(true);
    root.traverse((o) => {
      if (!o.isMesh && !o.isPoints && !o.isLine && !o.isInstancedMesh) return;
      box.setFromObject(o);
      if (!isFinite(box.min.x)) return;
      const w = box.max.x - box.min.x;
      if (w > 400) return; // sky, ground
      if (box.max.x < x0 || box.min.x > x1 || box.min.z > zmin) { o.visible = false; hid.push(o.name || o.type); }
      else kept.push(o.name + ' ' + box.min.x.toFixed(1) + '..' + box.max.x.toFixed(1));
    });
    return { hid: hid.length, kept: kept.slice(0, 60) };
  }, args.keep);
  await fs.writeFile(out + '/kept.json', JSON.stringify(r, null, 1));
}
if (args.moonAway) await p.evaluate(() => { const { OUT } = window.__node.internals(); const u = OUT.sky.material.uniforms; u.moonDir.value.set(0, 0.3, 1).normalize(); });
for (const [name, e, t] of VIEWS) {
  await p.evaluate(([e, t]) => window.__node.cam(e, t), [e, t]);
  await p.waitForTimeout(2500);
  await p.screenshot({ path: `${out}/${name}.png` });
}
const st = await p.evaluate(() => window.__node.state);
await fs.writeFile(out + '/state.json', JSON.stringify({ dusk: st.dusk, pos: st.pos, errs }, null, 1));
console.log('dusk', st.dusk, 'errors', errs.length, errs.slice(0, 3));
await browser.close();
