import { readFile, writeFile, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const dir = fileURLToPath(new URL('./', import.meta.url));
const root = fileURLToPath(new URL('../../../', import.meta.url));
const hash = async file => createHash('sha256').update(await readFile(file)).digest('hex');
const report = JSON.parse(await readFile(path.join(dir, 'report.json'), 'utf8'));
const manifest = JSON.parse(await readFile(path.join(dir, 'manifest.json'), 'utf8'));
const source = JSON.parse(await readFile(path.join(dir, 'source-snapshot.json'), 'utf8'));
const checks = [];
const check = (id, passed) => { checks.push({ id, passed: !!passed }); if (!passed) throw new Error(id); };
check('capture valid with no errors or failures', report.captureValid && !report.failure && report.failures.length === 0 && report.errors.count === 0);
check('all requested poses retained', report.poses.length === manifest.requestedPoses.length);
check('frozen source matches capture', source.sourceSha === report.sourceSha && source.sourceSnapshot.sha256 === report.sourceSnapshotSha256 && report.sourceStayedFixed);
check('capture script hash', await hash(path.join(dir, 'capture.mjs')) === report.captureScriptSha256);
check('selector hash', await hash(path.join(dir, 'select-poses.mjs')) === report.selectorSha256);
check('imported map hash', await hash(path.join(root, 'maps/Eldara Full 2026-07-23-20-37.json')) === report.mapSha256);
for (const pose of report.poses) {
  check(`${pose.id}: ready, biome and water kind`, pose.readiness.ready && pose.actualBiomeId === pose.expectedBiomeId && pose.targetWater.kind === pose.expectedWaterKind);
  check(`${pose.id}: 60 consecutive ready frames`, pose.preparation.readiness.readyFrames >= 60 && (!pose.preparation.groundPreparation || pose.preparation.groundPreparation.readyFrames >= 60));
  check(`${pose.id}: canonical position`, Math.hypot(pose.canonical.x - pose.x, pose.canonical.z - pose.z) < .05);
}
for (const artifact of report.artifacts) {
  const filename = path.join(dir, artifact.path);
  check(`${artifact.path}: SHA-256`, await hash(filename) === artifact.sha256);
  const meta = await sharp(filename).metadata();
  check(`${artifact.path}: dimensions`, meta.width === 1600 && meta.height === 900);
}
check('ocean, lake and river coverage', [1, 2, 3].every(kind => report.poses.some(p => p.targetWater.kind === kind)));
check('six coastal biomes', new Set(report.poses.filter(p => p.id.startsWith('coast-')).map(p => p.actualBiomeId)).size >= 6);
for (const relative of ['scripts/lib/world-visual-prepare-pose.mjs', 'scripts/lib/world-visual-canvas.mjs', 'scripts/lib/world-visual-source.mjs', 'scripts/lib/world-visual-report.mjs', 'scripts/lib/perf-browser-errors.mjs', 'scripts/perf-run-lock.mjs']) {
  check(`${relative}: current helper matches frozen revision`, await hash(path.join(root, relative)) === source.sourceSnapshot.files[relative]);
}
for (const filename of [path.join(dir, 'README.md'), path.join(root, 'docs/plans/water-aaa-look-and-feel-plan-2026-10-16.md')]) {
  const markdown = await readFile(filename, 'utf8');
  for (const match of markdown.matchAll(/\]\(([^)]+)\)/g)) {
    const target = match[1].split('#')[0];
    if (!target || /^https?:/.test(target)) continue;
    const linked = path.resolve(path.dirname(filename), target);
    await access(linked);
    check(`local link: ${path.relative(root, linked)}`, true);
  }
}
const result = { verifiedAt: new Date().toISOString(), sourceSha: report.sourceSha, passed: true,
  cleanScreenshots: report.poses.length, pngArtifacts: report.artifacts.length,
  contactSheetSha256: await hash(path.join(dir, 'contact-sheet.jpg')), checks };
await writeFile(path.join(dir, 'validation.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ passed: true, checks: checks.length, cleanScreenshots: report.poses.length }));
