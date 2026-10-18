import { monitorWindowsBrowserForeground } from './perf-browser-foreground-win32.mjs';

/** Foreground is part of a headed benchmark's workload. Activate only the
 * browser returned by this Playwright connection; never search other windows. */
export async function focusPerfBrowser(browser, page, { headed }) {
  if (!headed) return async () => ({ required: false, passed: true });
  await page.bringToFront();
  let method = 'playwright';
  let nativeMonitor = null;
  if (process.platform === 'win32') {
    const session = await browser.newBrowserCDPSession();
    let pid;
    try {
      const { processInfo } = await session.send('SystemInfo.getProcessInfo');
      pid = processInfo.find(p => p.type === 'browser')?.id;
    } finally { await session.detach(); }
    if (!Number.isSafeInteger(pid) || pid <= 0) throw new Error('Cannot identify the owned benchmark browser.');
    nativeMonitor = await monitorWindowsBrowserForeground(pid);
    browser.once('disconnected', () => { nativeMonitor().catch(() => {}); });
    method = 'windows-native-foreground';
    // AppActivate can focus browser chrome (for example the address bar).
    // Re-select the owned page after native activation, without a canvas click.
    await page.bringToFront();
    await page.evaluate(() => {
      window.focus();
      // Native activation may leave focus in browser chrome. Select the owned
      // renderer without clicking (which could interact with the world).
      const canvas = window.__editor?.terrainView?.renderer?.domElement;
      if (canvas) {
        const tabIndex = canvas.getAttribute('tabindex');
        if (tabIndex === null) canvas.tabIndex = -1;
        canvas.focus({ preventScroll: true });
        if (tabIndex === null) canvas.removeAttribute('tabindex');
      }
    });
  }
  if (!await page.evaluate(() => document.hasFocus())) {
    // Some Windows Chromium launches leave keyboard focus in browser chrome.
    // A real input event selects the renderer; programmatic canvas.focus()
    // alone cannot do that. Consume the click on a temporary inert target so
    // setup cannot click a world tool or request pointer lock.
    await page.evaluate(() => {
      const target = document.createElement('button');
      target.dataset.perfFocusTarget = '';
      target.type = 'button';
      target.tabIndex = -1;
      target.style.cssText = 'position:fixed;left:0;top:0;width:8px;height:8px;padding:0;border:0;opacity:0.01;z-index:2147483647';
      for (const type of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click']) {
        target.addEventListener(type, event => event.stopPropagation());
      }
      document.body.append(target);
    });
    try { await page.locator('[data-perf-focus-target]').click({ timeout: 5000 }); }
    catch (error) { error.nativeFocus = await nativeMonitor?.(); throw error; }
    finally { await page.evaluate(() => document.querySelector('[data-perf-focus-target]')?.remove()); }
  }
  // A cold renderer may block requestAnimationFrame longer than a polling
  // timeout even while its real window and document retain focus. Read focus
  // after pending renderer work completes; the native monitor remains active.
  try {
    if (!await page.evaluate(() => document.hasFocus())) throw new Error('The benchmark document does not have focus.');
  }
  catch (error) { error.nativeFocus = await nativeMonitor?.(); throw error; }
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
    const native = await nativeMonitor?.();
    const result = await page.evaluate(() => {
      const state = window.__perfBrowserFocus;
      window.removeEventListener('blur', state.listener);
      window.removeEventListener('focus', state.listener);
      document.removeEventListener('visibilitychange', state.listener);
      return { focusedAtEnd: document.hasFocus(), lostFocus: state.lostFocus, events: state.events };
    });
    return { required: true, method, ...result, ...(native ? { native } : {}),
      passed: result.focusedAtEnd && !result.lostFocus && (!native || native.passed) };
  };
}
