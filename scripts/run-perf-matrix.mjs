#!/usr/bin/env node
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { evaluatePerfMatrix } from './perf-matrix-gates.mjs';
import { acquirePerfRunLock, waitForPerfRunLock } from './perf-run-lock.mjs';
import { PERF_FOCUS_EXIT_CODE } from './lib/perf-browser-focus.mjs';
import { PERF_CHROMIUM_GPU_ARGS, perfEnvironmentFingerprint, readPerfEnvironment } from './lib/perf-environment.mjs';

if (process.argv.includes('--help')) {
  console.log('Usage: npm run qa:perf:matrix -- --headed [--url URL] [--resume] [--focus-retries 0-5]');
  console.log('--resume reuses captures with matching source, settings, OS, Chromium, GPU and driver.');
  console.log('--focus-retries retries only rejected focus captures (default: 2).');
  process.exit(0);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'tmp', 'perf-matrix');
fs.mkdirSync(path.join(root, 'tmp'), { recursive: true });
const releaseRunLock = acquirePerfRunLock(path.join(root, 'tmp', 'perf-matrix.lock'));
process.once('exit', releaseRunLock);

function readArg(name, fallback = null) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : (process.argv[index + 1] ?? fallback);
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function runScript(script, args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script, ...args], {
      cwd: root,
      stdio: 'inherit', windowsHide: true,
    });
    child.once('error', (error) => resolve({ code: 1, error: error.message }));
    child.once('exit', (code, signal) => resolve({ code: code ?? 1, signal }));
  });
}

async function runCapture(script, args, outPath, retries) {
  const attempts = [];
  for (let retry = 0; retry <= retries; retry += 1) {
    fs.rmSync(outPath, { force: true });
    const execution = await runScript(script, args);
    attempts.push(execution);
    if (execution.code !== PERF_FOCUS_EXIT_CODE || retry === retries) return { ...execution, attempts };
    if (fs.existsSync(outPath)) {
      const rejectedPath = outPath.replace(/\.json$/, `.focus-rejected-${Date.now()}.json`);
      fs.renameSync(outPath, rejectedPath);
      execution.rejectedPath = rejectedPath;
    }
    console.log(`Retrying ${path.basename(outPath)} after foreground focus loss (${retry + 1}/${retries}).`);
  }
}

function sourceIdentity() {
  try {
    const git = (cwd, ...args) => execFileSync('git', args, { cwd, windowsHide: true });
    const repository = git(root, 'rev-parse', '--show-toplevel').toString().trim();
    const hash = createHash('sha256').update(git(repository, 'rev-parse', 'HEAD'));
    const files = Buffer.concat([
      git(repository, 'diff', '--name-only', '-z', 'HEAD'),
      git(repository, 'ls-files', '--others', '--exclude-standard', '-z'),
    ]).toString().split('\0').filter(Boolean).sort();
    for (const file of files) {
      const filePath = path.join(repository, file);
      hash.update(file).update('\0');
      if (fs.existsSync(filePath)) hash.update(createHash('sha256').update(fs.readFileSync(filePath)).digest());
      else hash.update('deleted');
    }
    return hash.digest('hex');
  } catch {
    return null;
  }
}

async function probeEnvironment(headed) {
  const unlock = await waitForPerfRunLock(path.join(root, 'tmp', `perf-browser-${process.platform}.lock`));
  let browser;
  try {
    browser = await chromium.launch({ headless: !headed, args: PERF_CHROMIUM_GPU_ARGS });
    return await readPerfEnvironment(browser);
  } catch (error) {
    console.warn('Could not read the benchmark hardware identity.', error.message);
    return null;
  } finally {
    try { await browser?.close(); } finally { unlock(); }
  }
}

function reportSummary(report) {
  const stylized = report.config?.world?.stylizedSurface;
  return {
    scenario: report.scenario,
    summary: report.summary,
    collision: report.collision,
    preparation: report.preparation,
    recovery: report.recovery,
    sceneryUpdateCpu: report.sceneryUpdateCpu,
    adapter: report.adapter,
    capture: report.capture,
    measuredCounters: report.measuredCounters,
    conditions: report.conditions,
    revisit: report.revisit ? reportSummary(report.revisit) : null,
    density: {
      treesPerChunk: stylized?.trees?.perChunk ?? null,
      candidateBudgetPerChunk:
        stylized?.trees?.habitat?.candidateBudgetPerChunk ?? null,
      maxAcceptedPerChunk:
        stylized?.trees?.habitat?.maxAcceptedPerChunk ?? null,
      bladesPerCell: stylized?.grass?.bladesPerCell ?? null,
      grassSystem: stylized?.grass?.system ?? 'clumps',
      meadowHighDensity: stylized?.grass?.meadow?.lod?.high?.density ?? null,
      meadowFarDensity: stylized?.grass?.meadow?.far?.density ?? null,
    },
    counters: {
      rendererWebGPUBackend: report.counters?.rendererWebGPUBackend ?? 0,
      rendererWebGLBackend: report.counters?.rendererWebGLBackend ?? 0,
      treeRebuilds: report.counters?.treeRebuilds ?? 0,
      treeManifestBuilds: report.counters?.treeManifestBuilds ?? 0,
      treeImpostorInstances: report.counters?.treeImpostorInstances ?? 0,
      grassLastChunkEffectiveBlades:
        report.counters?.grassLastChunkEffectiveBlades ?? 0,
      grassLastChunkTriangles: report.counters?.grassLastChunkTriangles ?? 0,
      waterChunksWet: report.counters?.waterChunksWet ?? 0,
      waterChunksRefractive: report.counters?.waterChunksRefractive ?? 0,
      constructionModulesResident:
        report.counters?.constructionModulesResident ?? 0,
      constructionStones: report.counters?.constructionStones ?? 0,
      attributeBytesUploaded: report.counters?.attributeBytesUploaded ?? 0,
      meadowInViewMissingTiles: report.counters?.meadowInViewMissingTiles,
      meadowInViewCapacityLagTiles: report.counters?.meadowInViewCapacityLagTiles,
      meadowWorkerFailures: report.counters?.meadowWorkerFailures ?? 0,
    },
  };
}

const baseUrl = readArg('url', 'http://localhost:5173');
const duration = readArg('duration', '10');
const warmup = readArg('warmup', '8');
const viewportWidth = readArg('viewportWidth', '1280');
const viewportHeight = readArg('viewportHeight', '720');
const headed = hasFlag('headed');
const includeWater = !hasFlag('skip-water');
const waterOnly = hasFlag('water-only');
const focusRetries = Number(readArg('focus-retries', '2'));
if (!Number.isInteger(focusRetries) || focusRetries < 0 || focusRetries > 5) {
  throw new Error('--focus-retries must be an integer from 0 through 5.');
}
const cases = [
  { id: 'standard', qa: 'diagonal', density: 'standard' },
  { id: 'dense-forest', qa: 'diagonal', density: 'dense-forest' },
  { id: 'high-grass', qa: 'diagonal', density: 'high-grass' },
  { id: 'dense-mixed', qa: 'diagonal', density: 'dense-mixed' },
  { id: 'construction-ring', qa: 'construction-ring', density: 'standard' },
  { id: 'settlement-approach', qa: 'settlement-approach', density: 'standard' },
];

fs.mkdirSync(outDir, { recursive: true });
const matrixPath = path.join(root, 'tmp', 'perf-matrix-latest.json');
const previousMatrix = waterOnly && fs.existsSync(matrixPath)
  ? JSON.parse(fs.readFileSync(matrixPath, 'utf8'))
  : null;
const measuredCaseConfig = {
  baseUrl,
  durationSeconds: Number(duration),
  warmupSeconds: Number(warmup),
  viewport: { width: Number(viewportWidth), height: Number(viewportHeight) },
  headed,
  resources: hasFlag('resources'),
};
const checkpointPath = path.join(root, 'tmp', 'perf-matrix-checkpoint.json');
const source = waterOnly ? null : sourceIdentity();
const environment = await probeEnvironment(headed);
const fingerprint = perfEnvironmentFingerprint(environment);
const key = source && fingerprint && JSON.stringify({ source, measuredCaseConfig, includeWater, fingerprint });
const previousCheckpoint = hasFlag('resume') && key && fs.existsSync(checkpointPath)
  ? JSON.parse(fs.readFileSync(checkpointPath, 'utf8'))
  : null;
const checkpoint = previousCheckpoint?.key === key ? previousCheckpoint : { key, cases: {}, water: null };
function saveCheckpoint() {
  if (!key) return;
  fs.writeFileSync(`${checkpointPath}.tmp`, JSON.stringify(checkpoint));
  fs.renameSync(`${checkpointPath}.tmp`, checkpointPath);
}
const previousEnvironmentMatches = fingerprint && fingerprint === perfEnvironmentFingerprint(previousMatrix?.environment);
const retainedMovement = waterOnly && previousEnvironmentMatches
  && previousMatrix.config?.baseUrl === baseUrl && previousMatrix.config?.headed === headed;
const results = retainedMovement ? (previousMatrix.cases ?? []) : [];
function checkCaptureEnvironment(execution, report) {
  if (execution.code !== 0 || !report || !fingerprint) return;
  if (perfEnvironmentFingerprint(report.capture?.environment) === fingerprint) return;
  execution.code = 1;
  execution.error = 'Capture hardware or browser changed during the matrix.';
  console.error(execution.error);
}
saveCheckpoint();
for (const entry of waterOnly ? [] : cases) {
  const completed = checkpoint.cases[entry.id];
  if (completed?.execution.code === 0 && completed.report) {
    console.log(`Resuming with completed case ${entry.id}.`);
    results.push(completed);
    continue;
  }
  const outPath = path.join(outDir, `${entry.id}.json`);
  const args = [
    '--url', baseUrl,
    '--qa', entry.qa,
    '--density', entry.density,
    '--duration', duration,
    '--warmup', warmup,
    '--settle',
    '--drain-seconds', '20',
    '--grass-diagnostics',
    '--viewportWidth', viewportWidth,
    '--viewportHeight', viewportHeight,
    '--out', outPath,
  ];
  if (entry.id === 'construction-ring') args.push('--x', '0', '--z', '-100', '--yaw', '180');
  if (entry.id === 'settlement-approach') args.push('--revisit', '--turn-on-revisit');
  if (hasFlag('resources')) args.push('--resources');
  if (headed) args.unshift('--headed');
  const execution = await runCapture('scripts/run-perf-qa.mjs', args, outPath, focusRetries);
  const report = fs.existsSync(outPath)
    ? reportSummary(JSON.parse(fs.readFileSync(outPath, 'utf8')))
    : null;
  checkCaptureEnvironment(execution, report);
  const result = { id: entry.id, execution, report };
  results.push(result);
  checkpoint.cases[entry.id] = result;
  saveCheckpoint();
  if (execution.code === PERF_FOCUS_EXIT_CODE) {
    console.error('Matrix paused after exhausting the foreground focus retries.');
    break;
  }
}

let water = includeWater ? checkpoint.water : null;
const focusBlocked = !waterOnly && results.some(entry => entry.execution.code === PERF_FOCUS_EXIT_CODE);
if (includeWater && !focusBlocked && (water?.execution.code !== 0 || !water.report)) {
  const source = path.join(root, 'tmp', 'water-acceptance-latest.json');
  const args = ['--existing-server', '--url', baseUrl];
  if (headed) args.push('--headed');
  const execution = await runCapture('scripts/run-water-acceptance-qa.mjs', args, source, focusRetries);
  water = {
    execution,
    report: fs.existsSync(source)
      ? reportSummary(JSON.parse(fs.readFileSync(source, 'utf8')))
      : null,
    acceptance: fs.existsSync(source)
      ? JSON.parse(fs.readFileSync(source, 'utf8')).waterAcceptance
      : null,
  };
  checkCaptureEnvironment(execution, water.report);
  checkpoint.water = water;
  saveCheckpoint();
}

const matrix = {
  version: 1,
  generatedAt: new Date().toISOString(),
  environment,
  config: {
    ...(retainedMovement
      ? previousMatrix.config
      : measuredCaseConfig),
    includeWater,
    waterOnlyRefresh: waterOnly,
  },
  cases: results,
  water,
};
matrix.gate = evaluatePerfMatrix(matrix, {
  requireCases: !waterOnly,
  requireWater: includeWater,
});
fs.writeFileSync(matrixPath, `${JSON.stringify(matrix, null, 2)}\n`);
console.log(JSON.stringify({
  outPath: matrixPath,
  cases: results.map(({ id, execution, report }) => ({
    id,
    exitCode: execution.code,
    avgFps: report?.summary?.avgFps ?? null,
    p95Ms: report?.summary?.dt?.p95Ms ?? null,
    maxMs: report?.summary?.dt?.maxMs ?? null,
    hitchCount: report?.summary?.hitchCount ?? null,
  })),
  water: water && {
    exitCode: water.execution.code,
    pass: water.acceptance?.pass ?? null,
    p95Ms: water.report?.summary?.dt?.p95Ms ?? null,
  },
  gate: matrix.gate,
}, null, 2));

if (
  results.some((entry) => entry.execution.code !== 0 || !entry.report)
  || (water && (water.execution.code !== 0 || !water.report))
  || !matrix.gate.passed
) {
  process.exitCode = 1;
}
