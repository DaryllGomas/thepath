// THE PATH landing page: the Junction backdrop at 3440, 2560, 1920, 1280, an 820 tablet and a 390 phone. Saves the first screen and the
// full page, and measures where the backdrop sits and that nothing scrolls sideways. It also shoots the backdrop alone
// (the page's content hidden) and finds the centre of the sign's lit neon in it: the centroid of the bright red-orange
// pixels in the top half, against the middle of the screen. Run on Atlas only:
//   atlas-run . tests/scene-shots.mjs <out-dir>
// Calls to the public stats service are blocked here so checks never count as visits.
import { chromium } from 'playwright-core';
import fs from 'node:fs/promises';
const out = process.env.OUT_DIR, base = process.env.SITE_URL;
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM, args: ['--use-gl=angle', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=vulkan'] });
const views = [
  { tag: '3440', viewport: { width: 3440, height: 1440 } },
  { tag: '2560', viewport: { width: 2560, height: 1440 } },
  { tag: '1920', viewport: { width: 1920, height: 1080 } },
  { tag: '1280', viewport: { width: 1280, height: 800 } },
  { tag: '820', viewport: { width: 820, height: 1180 } },
  { tag: '390', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
];
const report = {}, errors = [];
for (const v of views) {
  const ctx = await browser.newContext(v);
  await ctx.route(/pulse\.bigpicsolutions\.com|formsubmit\.co/, (r) => r.abort('blockedbyclient'));
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(`[${v.tag}] pageerror: ${e.message}`));
  p.on('response', (r) => { if (r.status() >= 400 && !/pulse\./.test(r.url())) errors.push(`[${v.tag}] ${r.status()} ${r.url()}`); });
  await p.goto(base + '/', { waitUntil: 'networkidle' });
  await p.waitForTimeout(1200);
  report[v.tag] = await p.evaluate(() => {
    const s = document.querySelector('.scene'), cs = getComputedStyle(s), r = s.getBoundingClientRect();
    return { viewport: innerWidth, scene: { w: Math.round(r.width), h: Math.round(r.height) }, size: cs.backgroundSize, position: cs.backgroundPosition,
      image: cs.backgroundImage.slice(0, 160), sideways: document.documentElement.scrollWidth - innerWidth };
  });
  console.log(v.tag, JSON.stringify(report[v.tag]));
  await p.screenshot({ path: `${out}/path-${v.tag}.png` });
  await p.screenshot({ path: `${out}/path-${v.tag}-full.png`, fullPage: true });
  // the backdrop alone, and where the sign's neon sits in it
  await p.addStyleTag({ content: 'header.top, main, footer, .foot, .wrap { visibility: hidden !important; }' });
  await p.waitForTimeout(300);
  // the neon: its centre of mass (its letters weigh it a touch right) and the middle of its left and right edges, as % of the
  // width off the middle of the screen; on the page as seen (backdrop) and on the art alone (the page's shading off too)
  const neon = (buf) => p.evaluate(async (b64) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const h = Math.floor(img.height / 2), d = g.getImageData(0, 0, img.width, h).data, xs = [];
    for (let i = 0; i < d.length; i += 4) { const r = d[i], gg = d[i + 1], bb = d[i + 2];
      if (r > 110 && r > gg * 1.4 && r > bb * 1.4) xs.push((i / 4) % img.width); }
    if (!xs.length) return { pixels: 0 };
    xs.sort((a, b) => a - b);
    const css = img.width / innerWidth, mid = innerWidth / 2, pct = (x) => +((x / css - mid) / innerWidth * 100).toFixed(2);
    const lo = xs[Math.floor(xs.length * 0.005)], hi = xs[Math.floor(xs.length * 0.995)];
    return { pixels: xs.length, centroidOffPct: pct(xs.reduce((a, x) => a + x, 0) / xs.length), edgesOffPct: pct((lo + hi) / 2),
      left: Math.round(lo / css), right: Math.round(hi / css) };
  }, buf.toString('base64'));
  report[v.tag].neon = await neon(await p.screenshot({ path: `${out}/path-${v.tag}-backdrop.png` }));
  await p.addStyleTag({ content: '.scene::before, .scene::after { display: none !important; }' });
  await p.waitForTimeout(200);
  report[v.tag].neonArt = await neon(await p.screenshot({ path: `${out}/path-${v.tag}-art.png` }));
  console.log(v.tag, 'neon', JSON.stringify(report[v.tag].neon), 'art', JSON.stringify(report[v.tag].neonArt));
  await ctx.close();
}
await fs.writeFile(out + '/report.json', JSON.stringify({ report, errors }, null, 1));
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no errors');
await browser.close();
