import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

// Browsing derivatives only; the capture PNGs and their hashes stay untouched.
const out = path.resolve(process.argv[2] ?? 'docs/qa/visual-audit-2026-10-18');
const report = JSON.parse(await readFile(path.join(out, 'report.json'), 'utf8'));
const planLink = path.relative(out, path.resolve('docs/plans/aaa-look-and-feel-plan-2026-10-18.md')).replaceAll('\\', '/');
if (!report.poses?.length) throw new Error('The report contains no captured poses.');
const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const annotated = new Set();
for (const pose of report.poses.filter(p => ['random-06', 'random-07', 'random-08', 'random-09'].includes(p.id))) {
  const trees = pose.vegetation?.trees.filter(t => t.screen.visible).slice(0, 3);
  if (!trees?.length) continue;
  const labels = trees.map((tree, index) => {
    const x = tree.screen.x * report.viewport.width, y = tree.screen.y * report.viewport.height;
    const top = 20 + index * 64;
    return `<path d="M 600 ${top + 26} L ${x} ${y}" stroke="#ffe49b" stroke-width="2" fill="none"/>
      <circle cx="${x}" cy="${y}" r="6" fill="#ffe49b" stroke="#132229"/>
      <rect x="20" y="${top}" width="580" height="56" rx="5" fill="#132229" fill-opacity=".92"/>
      <text x="32" y="${top + 22}" fill="white" font-family="sans-serif" font-size="17">${index + 1}. ${escape(tree.stableId)} · prototype ${tree.prototype} · ${escape(tree.ageClass)}</text>
      <text x="32" y="${top + 43}" fill="#c8ded6" font-family="sans-serif" font-size="14">${escape(path.basename(tree.asset))} · ${escape(tree.speciesId)} · cell ID ${tree.tileId}</text>`;
  }).join('');
  const svg = `<svg width="${report.viewport.width}" height="${report.viewport.height}" xmlns="http://www.w3.org/2000/svg">${labels}</svg>`;
  await sharp(path.join(out, `${pose.id}.png`)).composite([{ input: Buffer.from(svg) }])
    .png().toFile(path.join(out, `${pose.id}-identities.png`));
  annotated.add(pose.id);
}
const cards = report.poses.map(p => `<article>
  <a href="${escape(p.id)}.png"><img src="${escape(p.id)}.png" loading="lazy" alt="${escape(p.name)}"></a>
  <h2>${escape(p.id)} · ${escape(p.name)}</h2>
  <p>${escape(p.world)} · camera biome ${p.actualBiomeId} · X ${p.x}, Z ${p.z} · ${escape(p.mode)}</p>
  <p><a href="${escape(p.id)}.png">Original clean PNG</a> · <a href="${escape(p.id)}-hud.png">Original HUD PNG</a>${annotated.has(p.id) ? ` · <a href="${escape(p.id)}-identities.png">Tree identities (QA overlay)</a>` : ''}</p>
</article>`).join('\n');
await writeFile(path.join(out, 'index.html'), `<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>World visual audit · October 18, 2026</title>
<style>
body{margin:0;background:#101a20;color:#e7eded;font:16px/1.5 system-ui,sans-serif}
header{max-width:1200px;margin:auto;padding:32px 24px}h1{margin:0}a{color:#b7dcde}
main{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,520px),1fr));gap:24px;padding:24px}
article{background:#1b292f;border-radius:8px;overflow:hidden}img{display:block;width:100%;height:auto}
h2{font-size:18px}article h2,article p{margin:12px 18px}
</style><header><h1>World visual audit · October 18, 2026</h1>
<p>${report.poses.length} views · source ${escape(report.sourceSha?.slice(0, 8))} · seeded selection ${report.seed} · ${report.viewport.width} × ${report.viewport.height}</p>
<p>Unedited renderer captures. Clean and HUD images are successive frames. Capture validity: ${report.captureValid === true ? 'passed' : 'incomplete or failed'}; this is not a performance verdict.</p>
<p><a href="${escape(planLink)}">Detailed improvement plan</a> · <a href="contact-sheet.jpg">Contact sheet</a> · <a href="report.json">Capture metadata</a></p></header>
<main>${cards}</main></html>\n`);

const tileWidth = 480, imageHeight = 270, labelHeight = 48, tileHeight = imageHeight + labelHeight;
const layers = [];
for (const [index, pose] of report.poses.entries()) {
  const left = index % 3 * tileWidth, top = Math.floor(index / 3) * tileHeight;
  layers.push({ input: await sharp(path.join(out, `${pose.id}.png`)).resize(tileWidth, imageHeight).toBuffer(), left, top });
  const label = `<svg width="${tileWidth}" height="${labelHeight}"><rect width="100%" height="100%" fill="#16232a"/>
    <text x="12" y="19" fill="#f1f4f1" font-family="sans-serif" font-size="13">${escape(pose.id)} · ${escape(pose.name.replace(' (targeted supplement)', ''))}</text>
    <text x="12" y="37" fill="#bdcece" font-family="sans-serif" font-size="11">${escape(pose.world)} · ID ${pose.actualBiomeId} · X ${pose.x}, Z ${pose.z}</text></svg>`;
  layers.push({ input: Buffer.from(label), left, top: top + imageHeight });
}
await sharp({ create: { width: tileWidth * 3, height: tileHeight * Math.ceil(report.poses.length / 3), channels: 3, background: '#16232a' } })
  .composite(layers).jpeg({ quality: 90 }).toFile(path.join(out, 'contact-sheet.jpg'));
console.log(`Built gallery and contact sheet for ${report.poses.length} views in ${out}.`);
