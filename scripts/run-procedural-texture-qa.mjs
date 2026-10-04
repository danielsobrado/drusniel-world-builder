import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'tmp', 'procedural-texture-qa');
const arg = process.argv.indexOf('--url');
const baseUrl = arg < 0 ? 'http://localhost:5173/' : process.argv[arg + 1];
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  headless: process.argv.includes('--headless'),
  args: ['--ignore-gpu-blocklist', '--use-angle=default', '--enable-gpu-rasterization'],
});
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 850 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', (response) => {
    if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
  });
  page.on('console', (message) => {
    if (message.type() === 'error'
        || (message.type() === 'warning' && /shader|wgsl|validation|pipeline/i.test(message.text()))) {
      errors.push(message.text());
    }
  });
  await page.goto(new URL('scripts/qa/procedural-textures.html', baseUrl).href);
  await page.waitForFunction(() => ['done', 'error'].includes(window.__textureQa?.status), null, { timeout: 60000 });
  const result = await page.evaluate(() => window.__textureQa);
  const report = { result, errors };
  await writeFile(path.join(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  await page.screenshot({ path: path.join(output, 'textures.png') });
  console.log(JSON.stringify(report, null, 2));
  if (result.status !== 'done' || !result.webgpu || errors.length) process.exitCode = 1;
} finally {
  await browser.close();
}
