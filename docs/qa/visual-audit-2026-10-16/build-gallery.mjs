import { readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
const out = 'docs/qa/visual-audit-2026-10-16';
const report = JSON.parse(await readFile(`${out}/report.json`, 'utf8'));
const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const old = await readFile('docs/qa/visual-audit-2026-10-15/index.html', 'utf8');
let header = old.slice(0, old.indexOf('<main>'))
  .replaceAll('October 15, 2026', 'October 16, 2026')
  .replaceAll('2026-10-15', '2026-10-16')
  .replaceAll('a0c9b11c', report.sourceSha.slice(0, 8));
header = header.replace('</header>', '<p>Known defect: the tree atlas signature is rejected at startup. These captures document current appearance, including fallback trees; they are not release acceptance. See the plan and tree-atlas-probe.json.</p></header>');
const articles = report.poses.map(p => `<article><a href="${p.id}.png" data-image-link><img src="${p.id}.png" data-clean="${p.id}.png" data-hud="${p.id}-hud.png" alt="${escape(p.name)} at ${p.x}, ${p.z}" loading="lazy"></a><div class="caption"><h2>${escape(p.id)} · ${escape(p.name)}</h2><p>${escape(p.world)} · camera-cell biome ${p.actualBiomeId} · X ${p.x}, Z ${p.z} · ${p.mode} · fully settled</p><a href="${p.id}.png">Original clean PNG</a> · <a href="${p.id}-hud.png">HUD PNG</a></div></article>`).join('\n');
const footer = old.slice(old.indexOf('</main>'));
await writeFile(`${out}/index.html`, `${header}<main>${articles}${footer}`);
const tileW = 480, imageH = 270, labelH = 44, tileH = imageH + labelH;
const composite = [];
for (const [i, p] of report.poses.entries()) {
  const left = i % 3 * tileW, top = Math.floor(i / 3) * tileH;
  const input = await sharp(`${out}/${p.id}.png`).resize(tileW, imageH).toBuffer();
  composite.push({ input, left, top });
  const label = `<svg width="${tileW}" height="${labelH}"><rect width="100%" height="100%" fill="#16232a"/><text x="12" y="18" fill="#f1f4f1" font-family="sans-serif" font-size="13">${escape(p.id)} · ${escape(p.name.replace(' (targeted supplement)', ''))}</text><text x="12" y="35" fill="#bdcece" font-family="sans-serif" font-size="11">${escape(p.world)} · ID ${p.actualBiomeId} · X ${p.x}, Z ${p.z}</text></svg>`;
  composite.push({ input: Buffer.from(label), left, top: top + imageH });
}
await sharp({ create: { width: tileW * 3, height: tileH * Math.ceil(report.poses.length / 3), channels: 3, background: '#16232a' } })
  .composite(composite).jpeg({ quality: 90 }).toFile(`${out}/contact-sheet.jpg`);
console.log(`Built gallery and contact sheet for ${report.poses.length} views.`);
