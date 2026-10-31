// THE PATH landing page: the Junction backdrop at 3440, 2560, 1920, 1280, an 820 tablet and a 390 phone. Saves the first screen and the
// full page, and measures where the backdrop sits and that nothing scrolls sideways. Run on Atlas only:
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
  await ctx.close();
}
await fs.writeFile(out + '/report.json', JSON.stringify({ report, errors }, null, 1));
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no errors');
await browser.close();
