import { spawn } from 'node:child_process';
import { copyFile, mkdir, open, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fileHash } from './lib/world-visual-report.mjs';

const option = (key, fallback) => process.argv.includes(key) ? process.argv[process.argv.indexOf(key) + 1] : fallback;
const root = fileURLToPath(new URL('../', import.meta.url));
const manifestPath = option('--manifest', 'docs/plans/aaa-next-pass-2026-10-18-evidence.json');
const manifest = JSON.parse(await readFile(path.resolve(root, manifestPath), 'utf8'));
const out = path.resolve(root, option('--out', 'docs/qa/world-audit-batches'));
const url = option('--url', 'http://localhost:5173');
const batchSize = Number(option('--batch-size', '3'));
const only = option('--only', null)?.split(',');
const poses = manifest.requestedPoses.filter(p => !only || only.includes(p.id));
if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 4 || !poses.length ||
  only?.some(id => !poses.some(p => p.id === id))) throw new Error('Invalid batch size or pose selection.');
await mkdir(out, { recursive: true });
if ((await readdir(out)).length) throw new Error(`Refusing nonempty audit output: ${out}`);
const groups = [];
for (const pose of poses) {
  // Imported cuts also prepare the macro backdrop; isolate their lifecycle.
  const last = groups.at(-1), limit = pose.world === 'eldara' ? 1 : batchSize;
  if (!last || last.length >= limit || last[0].world !== pose.world) groups.push([pose]);
  else last.push(pose);
}
const report = { schemaVersion: 1, kind: 'visual-audit-batch-aggregate', startedAt: new Date().toISOString(),
  requestedPoses: poses, replayManifest: manifestPath, poseManifestSha256: await fileHash(path.resolve(root, manifestPath)),
  seed: manifest.seed, sampledCandidates: manifest.sampledCandidates, generator: manifest.generator,
  viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1, poses: [], batches: [], failures: [], artifacts: [],
  errors: { count: 0, errors: [] }, captureValid: false };
await writeFile(path.join(out, 'manifest.json'), JSON.stringify(report, null, 2) + '\n');
for (const [index, group] of groups.entries()) {
  const id = `batch-${String(index + 1).padStart(2, '0')}`, directory = path.join(out, id);
  await mkdir(directory); const log = await open(path.join(out, `${id}.log`), 'wx');
  console.log(`START ${id}: ${group.map(p => p.id).join(', ')} at ${new Date().toISOString()}`);
  const code = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(root, 'scripts/capture-world-audit-2026-10-18.mjs')], {
      cwd: root, stdio: ['ignore', log.fd, log.fd], env: { ...process.env,
        AAA_AUDIT_MANIFEST: manifestPath, AAA_AUDIT_URL: url, AAA_AUDIT_OUT: directory,
        AAA_AUDIT_ONLY: group.map(p => p.id).join(','), AAA_AUDIT_RELOAD: '0',
        AAA_AUDIT_CONTROLS: '', AAA_AUDIT_SETTLE_MS: option('--settle-ms', '300000') },
    });
    child.once('error', reject); child.once('exit', resolve);
  });
  await log.close();
  let batch;
  try { batch = JSON.parse(await readFile(path.join(directory, 'report.json'), 'utf8')); }
  catch (error) { batch = { captureValid: false, failure: error.message, poses: [], artifacts: [] }; }
  report.batches.push({ id, code, captureValid: batch.captureValid, sourceSha: batch.sourceSha,
    sourceSnapshotSha256: batch.sourceSnapshotSha256, focus: batch.focus, report: `${id}/report.json` });
  if (!report.sourceSha && batch.sourceSha) {
    for (const key of ['sourceSha', 'sourceSnapshotSha256', 'adapter', 'configSha256', 'mapSha256', 'lighting']) report[key] = batch[key];
  }
  for (const pose of batch.poses ?? []) report.poses.push({ ...pose, batchReport: `${id}/report.json`,
    captureStatus: batch.captureValid ? 'valid frozen hardware capture' : 'diagnostic failed batch' });
  for (const artifact of batch.artifacts ?? []) {
    await copyFile(path.join(directory, artifact.path), path.join(out, artifact.path));
    report.artifacts.push(artifact);
  }
  const observed = batch.errors ?? { count: 0, errors: [] };
  report.errors.count += observed.count; report.errors.errors.push(...observed.errors);
  if (code !== 0 || !batch.captureValid) report.failures.push({ id, code, failure: batch.failure, failures: batch.failures });
  console.log(`END ${id}: ${batch.poses?.length ?? 0} poses, valid ${batch.captureValid}`);
  await writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
}
report.sourceStayedFixed = report.batches.every(b => b.sourceSha === report.sourceSha && b.sourceSnapshotSha256 === report.sourceSnapshotSha256);
report.captureValid = report.failures.length === 0 && report.sourceStayedFixed && report.errors.count === 0 && report.poses.length === poses.length;
report.finishedAt = new Date().toISOString();
await writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
if (!report.captureValid) process.exitCode = 1;
console.log(JSON.stringify({ captureValid: report.captureValid, poses: report.poses.length, failures: report.failures.length }));
