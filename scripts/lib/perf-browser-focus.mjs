import { execFileSync } from 'node:child_process';

/** Foreground is part of a headed benchmark's workload. Activate only the
 * browser returned by this Playwright connection; never search other windows. */
export async function focusPerfBrowser(browser, page, { headed }) {
  if (!headed) return async () => ({ required: false, passed: true });
  await page.bringToFront();
  let method = 'playwright';
  if (!await page.evaluate(() => document.hasFocus()) && process.platform === 'win32') {
    const session = await browser.newBrowserCDPSession();
    let pid;
    try {
      const { processInfo } = await session.send('SystemInfo.getProcessInfo');
      pid = processInfo.find(p => p.type === 'browser')?.id;
    } finally { await session.detach(); }
    if (!Number.isSafeInteger(pid) || pid <= 0) throw new Error('Cannot identify the owned benchmark browser.');
    execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      `$qaShell = New-Object -ComObject WScript.Shell; $qaShell.AppActivate(${pid}) | Out-Null`],
    { windowsHide: true, timeout: 10000, stdio: 'pipe' });
    method = 'windows-app-activate';
  }
  await page.waitForFunction(() => document.hasFocus(), null, { timeout: 5000 });
  await page.evaluate(() => {
    const state = window.__perfBrowserFocus = { events: [], lostFocus: false };
    state.listener = event => {
      const focused = event.type !== 'blur' && document.hasFocus() && !document.hidden;
      if (!focused) state.lostFocus = true;
      if (state.events.length < 32) state.events.push({ type: event.type, focused, timeMs: performance.now() });
    };
    window.addEventListener('blur', state.listener);
    window.addEventListener('focus', state.listener);
    document.addEventListener('visibilitychange', state.listener);
  });
  return async () => {
    const result = await page.evaluate(() => {
      const state = window.__perfBrowserFocus;
      window.removeEventListener('blur', state.listener);
      window.removeEventListener('focus', state.listener);
      document.removeEventListener('visibilitychange', state.listener);
      return { focusedAtEnd: document.hasFocus(), lostFocus: state.lostFocus, events: state.events };
    });
    return { required: true, method, ...result, passed: result.focusedAtEnd && !result.lostFocus };
  };
}
