import sharp from 'sharp';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('./', import.meta.url));
const report = JSON.parse(await readFile(path.join(dir, 'report.json'), 'utf8'));
const width = 640, imageHeight = 360, labelHeight = 44, columns = 3;
const height = imageHeight + labelHeight;
const xml = s => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const composites = [], index = [];
for (let i = 0; i < report.poses.length; i++) {
  const pose = report.poses[i], filename = `${pose.id}.png`, bytes = await readFile(path.join(dir, filename));
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  if (report.artifacts.find(a => a.path === filename)?.sha256 !== sha256) throw new Error(`Capture changed: ${filename}`);
  const left = (i % columns) * width, top = Math.floor(i / columns) * height;
  composites.push({ input: await sharp(bytes).resize(width, imageHeight).toBuffer(), left, top });
  const label = `<svg width="${width}" height="${labelHeight}"><rect width="100%" height="100%" fill="#15232e"/><text x="12" y="27" font-family="Arial" font-size="17" fill="#edf3f7">${xml(`${pose.id} | ${pose.name}`)}</text></svg>`;
  composites.push({ input: Buffer.from(label), left, top: top + imageHeight });
  index.push({ id: pose.id, name: pose.name, world: pose.world, x: pose.x, z: pose.z,
    biome: pose.actualBiomeId, kind: pose.targetWater.kind, depth: pose.targetWater.depth,
    ready: pose.readiness.ready, sha256 });
}
await sharp({ create: { width: width * columns, height: height * Math.ceil(report.poses.length / columns), channels: 3, background: '#15232e' } })
  .composite(composites).jpeg({ quality: 90 }).toFile(path.join(dir, 'contact-sheet.jpg'));
await writeFile(path.join(dir, 'gallery-index.json'), JSON.stringify(index, null, 2) + '\n');
console.log(JSON.stringify({ count: index.length, contactSheet: 'contact-sheet.jpg', captureValid: report.captureValid }));
