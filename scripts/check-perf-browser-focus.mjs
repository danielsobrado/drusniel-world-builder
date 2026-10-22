import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { focusPerfBrowser } from './lib/perf-browser-focus.mjs';
import { waitForPerfRunLock } from './perf-run-lock.mjs';

if (process.platform !== 'win32') throw new Error('This native foreground control requires Windows.');
const option = (name, fallback) => process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : fallback;
const out = option('--out', 'tmp/perf-browser-focus-control.json');
const root = fileURLToPath(new URL('../', import.meta.url));
const release = await waitForPerfRunLock(path.join(root, 'tmp', `perf-browser-${process.platform}.lock`));
const browsers = [];
const report = { startedAt: new Date().toISOString(), passed: false };
try {
  for (let index = 0; index < 2; index++) browsers.push(await chromium.launch({ headless: false }));
  const pages = await Promise.all(browsers.map(browser => browser.newPage()));
  const positive = await focusPerfBrowser(browsers[0], pages[0], { headed: true });
  await pages[0].waitForTimeout(800);
  report.foreground = await positive();
  const negative = await focusPerfBrowser(browsers[0], pages[0], { headed: true });
  const cdp = await pages[0].context().newCDPSession(pages[0]);
  await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  // Both windows belong to this control. Do not manipulate a user's app.
  const other = await focusPerfBrowser(browsers[1], pages[1], { headed: true });
  await pages[1].waitForTimeout(800);
  report.emulatedDomFocus = await pages[0].evaluate(() => document.hasFocus());
  report.background = await negative();
  report.otherOwnedWindow = await other();
  await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: false });
  await cdp.detach();
  // Reproduce a cold renderer blocking after the first real focus read. Native
  // ownership and document.hasFocus remain real; no focus value is emulated.
  await pages[0].evaluate(() => {
    const original = document.hasFocus.bind(document);
    let first = true;
    document.hasFocus = () => {
      const focused = original();
      if (first) {
        first = false;
        setTimeout(() => {
          const until = performance.now() + 6500;
          while (performance.now() < until) { /* cold shader/pipeline stall */ }
        }, 0);
      }
      return focused;
    };
  });
  const busy = await focusPerfBrowser(browsers[0], pages[0], { headed: true });
  report.busyForeground = await busy();
  await pages[0].goto('data:text/html,<title>Perf QA cold navigation</title><script>const end=performance.now()+6500;while(performance.now()<end){}</script>', { waitUntil: 'commit' });
  const coldNavigation = await focusPerfBrowser(browsers[0], pages[0], { headed: true });
  report.coldNavigationForeground = await coldNavigation();
  report.passed = report.foreground.passed && report.foreground.native.samples >= 5
    && report.emulatedDomFocus && !report.background.passed
    && report.background.native.lostFocus && report.otherOwnedWindow.passed && report.busyForeground.passed
    && report.coldNavigationForeground.passed;
} catch (error) { report.error = error.stack; }
finally {
  await Promise.all(browsers.map(browser => browser.close()));
  release();
  report.finishedAt = new Date().toISOString();
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
  if (!report.passed) process.exitCode = 1;
}
