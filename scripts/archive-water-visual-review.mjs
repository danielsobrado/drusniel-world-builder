import { access, copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import sharp from 'sharp';

const option = name => process.argv[process.argv.indexOf(name) + 1];
if (!process.argv.includes('--input') || !process.argv.includes('--out')) throw new Error('Provide --input and --out; never overwrite the original audit.');
const input = path.resolve(option('--input')), output = path.resolve(option('--out'));
if (input === output) throw new Error('Input and archive must be different directories.');
const report = JSON.parse(await readFile(path.join(input, 'report.json'), 'utf8'));
const source = JSON.parse(await readFile(path.join(input, 'source-snapshot.json'), 'utf8'));
const checks = [];
const check = (id, passed) => { if (!passed) throw new Error(id); checks.push({ id, passed: true }); };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const fileHash = async filename => hash(await readFile(filename));
check('complete, error-free and source-stable capture', report.captureValid && report.sourceStayedFixed && report.errors.count === 0 && !report.failures.length);
check('all thirteen views', report.poses.length === 13);
check('three water kinds', [1, 2, 3].every(kind => report.poses.some(p => p.targetWater.kind === kind)));
check('source identity', source.sourceSha === report.sourceSha && source.sourceSnapshot.sha256 === report.sourceSnapshotSha256);
check('capture runner identity', await fileHash('scripts/run-water-visual-review.mjs') === report.captureScriptSha256);
check('selector identity', await fileHash('docs/qa/water-aaa-audit-2026-10-16/select-poses.mjs') === report.selectorSha256);
check('imported map identity', await fileHash('maps/Eldara Full 2026-07-23-20-37.json') === report.mapSha256);
for (const pose of report.poses) {
  check(`${pose.id}: ready and correct identity`, pose.readiness.ready && pose.expectedBiomeId === pose.actualBiomeId && pose.targetWater.kind === pose.expectedWaterKind);
  check(`${pose.id}: canonical pose`, Math.hypot(pose.canonical.x - pose.x, pose.canonical.z - pose.z) < .05);
  check(`${pose.id}: prepared frames`, pose.preparation.readiness.readyFrames >= 60 && (!pose.preparation.groundPreparation || pose.preparation.groundPreparation.readyFrames >= 60));
}
await mkdir(output, { recursive: true });
for (const artifact of report.artifacts) {
  const filename = path.join(input, artifact.path);
  check(`${artifact.path}: bytes`, await fileHash(filename) === artifact.sha256);
  const meta = await sharp(filename).metadata();
  check(`${artifact.path}: native dimensions`, meta.width === 1600 && meta.height === 900);
  await copyFile(filename, path.join(output, artifact.path));
}
for (const filename of ['report.json', 'source-snapshot.json', 'manifest.json']) await copyFile(path.join(input, filename), path.join(output, filename));
await copyFile('scripts/run-water-visual-review.mjs', path.join(output, 'capture-script.mjs'));

const xml = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const label = (text, width = 640) => Buffer.from(`<svg width="${width}" height="40"><rect width="100%" height="100%" fill="#15232e"/><text x="12" y="26" font-family="Arial" font-size="17" fill="#edf3f7">${xml(text)}</text></svg>`);
const layers = [];
for (const [i, pose] of report.poses.entries()) {
  const left = i % 3 * 640, top = Math.floor(i / 3) * 400;
  layers.push({ input: await sharp(path.join(output, `${pose.id}.png`)).resize(640, 360).toBuffer(), left, top });
  layers.push({ input: label(`${pose.id} | ${pose.name}`), left, top: top + 360 });
}
await sharp({ create: { width: 1920, height: Math.ceil(report.poses.length / 3) * 400, channels: 3, background: '#15232e' } })
  .composite(layers).jpeg({ quality: 90 }).toFile(path.join(output, 'contact-sheet.jpg'));
for (const id of ['river-06', 'coast-12']) {
  const before = path.resolve('docs/qa/water-aaa-audit-2026-10-16', `${id}.png`), after = path.join(output, `${id}.png`);
  await access(before);
  await sharp({ create: { width: 1600, height: 1880, channels: 3, background: '#15232e' } }).composite([
    { input: label('October 16 audit | live water phase', 1600), left: 0, top: 0 },
    { input: before, left: 0, top: 40 },
    { input: label('October 17 implementation | fixed water time 123.4 s', 1600), left: 0, top: 940 },
    { input: after, left: 0, top: 980 },
  ]).jpeg({ quality: 92 }).toFile(path.join(output, `${id}-comparison.jpg`));
}
const validation = { verifiedAt: new Date().toISOString(), sourceSha: report.sourceSha, passed: true, checks,
  cleanScreenshots: report.poses.length, pngArtifacts: report.artifacts.length,
  gallerySha256: await fileHash(path.join(output, 'contact-sheet.jpg')) };
await writeFile(path.join(output, 'validation.json'), JSON.stringify(validation, null, 2) + '\n');
console.log(JSON.stringify({ passed: true, checks: checks.length, archive: output }));
