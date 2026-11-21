import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

// PR I phase I.2: isolated GPU FFT verification against the I.1 CPU oracle, plus
// timings, on headed hardware WebGPU. Needs the dev server (`npm run dev`) serving
// ocean-fft-qa.html. Usage: node scripts/run-ocean-fft-qa.mjs --url http://127.0.0.1:5174
//   [--out tmp/ocean-fft-qa/report.json] [--no-benchmark]
const option = (name, fallback) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : fallback);
const url = new URL('/ocean-fft-qa.html', option('--url', 'http://127.0.0.1:5174'));
const out = path.resolve(option('--out', 'tmp/ocean-fft-qa/report.json'));
const benchmark = !process.argv.includes('--no-benchmark');

const browser = await chromium.launch({ headless: false, args: [
  '--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--use-angle=default', '--enable-gpu-rasterization',
  '--disable-gpu-vsync', '--disable-frame-rate-limit', '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding',
] });
let report;
const consoleErrors = [];
try {
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
  page.setDefaultTimeout(600_000);
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('pageerror', (error) => consoleErrors.push(error.message));
  page.on('response', (response) => { if (response.status() >= 400) consoleErrors.push(`${response.status()} ${response.url()}`); });
  await page.goto(url.href);
  await page.waitForFunction(() => !!window.__oceanFftQa);
  report = await page.evaluate((options) => window.__oceanFftQa.run(options), { benchmark });
} finally {
  await browser.close();
}
report.consoleErrors = consoleErrors;
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
report.source = { commit: git('rev-parse', 'HEAD'), workingTreeDirty: git('status', '--porcelain').length > 0, url: url.href };
await mkdir(path.dirname(out), { recursive: true });
const shots = path.join(path.dirname(out), 'screenshots');
await mkdir(shots, { recursive: true });
for (const [name, dataUrl] of Object.entries(report.screenshots ?? {})) {
  await writeFile(path.join(shots, `${name}.png`), Buffer.from(dataUrl.split(',')[1], 'base64'));
}
report.screenshots = Object.keys(report.screenshots ?? {}).map((name) => `screenshots/${name}.png`);
await writeFile(out, `${JSON.stringify(report, null, 2)}\n`);

const failed = (list) => list.filter((row) => !row.pass).length;
const lists = ['smallGrids', 'i1Table', 'direction', 'proof64', 'candidate128', 'orientation'];
console.log(`adapter ${report.adapter.vendor} ${report.adapter.architecture} (${report.adapter.backend}, three r${report.adapter.three})`);
for (const key of lists) console.log(`${key}: ${report[key].length - failed(report[key])}/${report[key].length} pass`);
for (const key of ['timeContract', 'cascadeIsolation', 'spectrumRebuild', 'seams', 'mips', 'scene', 'lifecycle', 'disabled']) console.log(`${key}: ${report[key].pass ? 'pass' : 'FAIL'}`);
for (const [label, row] of Object.entries(report.topologies ?? {})) {
  console.log(`${label}: compute ${row.computeMs.median?.toFixed(4)} ms, output ${row.outputPassesMs.median?.toFixed(4)} ms, throughput ${row.throughputMsPerTransform.toFixed(4)} ms/transform`);
}
console.log(`validation errors ${report.validationErrors.length}, console errors ${consoleErrors.length}; report ${out}`);
console.log(report.pass ? 'PASS' : 'FAIL');
process.exitCode = report.pass ? 0 : 1;
