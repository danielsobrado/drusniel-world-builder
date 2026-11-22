#!/usr/bin/env node
// Captures the workbench at a fixed 1600x900 viewport (plus one phone view) for visual
// comparison between PRs. Needs `npm run dev` running. Playwright is borrowed from the
// parent repository's devDependencies rather than added here.
// It steps and snapshots the active scenario, so run the backend on throwaway storage:
//   WS_SCENARIO_STORAGE=<temp dir> npm run dev
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = createRequire(path.join(root, '../package.json'))('playwright');
const url = process.argv[2] ?? 'http://127.0.0.1:5180/';
const out = path.join(root, 'docs/screenshots');
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const shot = (name) => page.screenshot({ path: path.join(out, `${name}.png`) });
  const workspace = async (name) => { await page.locator('.workspace-bar').getByRole('tab', { name, exact: true }).click(); };

  await page.goto(url);
  await page.getByText('Reference counts verified').waitFor();
  await shot('01-world-overview');

  await workspace('Settlements');
  await page.getByRole('cell', { name: 'Winchwark', exact: true }).click();
  await page.getByRole('heading', { name: /Winchwark/ }).waitFor();
  await shot('02-settlement-explorer');

  await page.getByRole('tab', { name: 'Connectivity' }).click();
  await page.locator('#explorer-search').fill('vhal');
  await page.getByRole('cell', { name: /Vhaltha/ }).click();
  await page.getByRole('heading', { name: /Vhaltha/ }).waitFor();
  await page.getByRole('tab', { name: 'Connectivity' }).click();
  await shot('03-settlement-filter-connectivity');

  await page.locator('#explorer-search').fill('');
  await workspace('Atlas');
  await page.locator('.route').first().waitFor();
  await shot('04-atlas');
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await shot('05-atlas-zoomed');

  await workspace('NPC budget');
  await page.getByText('By settlement class').waitFor();
  await shot('06-npc-budget');

  await workspace('Pilot');
  await page.getByText('Why these three').waitFor();
  await shot('07-pilot');

  await workspace('Simulation');
  await page.getByText('Population trend').waitFor();
  await page.getByRole('button', { name: '+Year' }).click();
  await page.getByText('1213-01-01').first().waitFor();
  await page.getByRole('combobox', { name: 'Speed (simulated days per second)' }).selectOption('120');
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: 'Pause simulation' }).click();
  await page.getByLabel('Snapshot label').fill('After the first year');
  await page.getByRole('button', { name: 'Save snapshot' }).click();
  await page.getByText('After the first year').first().waitFor();
  await page.getByRole('cell', { name: 'Vhaltha' }).click();
  await page.getByLabel('Inspector', { exact: true }).getByRole('tab', { name: 'Simulation' }).click();
  await page.locator('.trend-svg rect').hover({ position: { x: 300, y: 80 } });
  await shot('09-simulation');

  const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
  await phone.goto(url);
  await phone.getByText('Reference counts verified').waitFor();
  await phone.screenshot({ path: path.join(out, '08-mobile-overview.png') });
} finally {
  await browser.close();
}
if (errors.length) {
  console.error(`Browser errors:\n${errors.join('\n')}`);
  process.exitCode = 1;
} else {
  console.log(`Screenshots written to ${path.relative(process.cwd(), out)}`);
}
