/** Keep failures visible without allowing a repeated error to grow the report. */
export function createBrowserErrorMonitor(page, limit = 32) {
  let count = 0;
  const errors = [];
  const record = (kind, message) => {
    count++;
    if (errors.length < limit) errors.push({ kind, message: String(message).slice(0, 4096) });
  };
  page.on('pageerror', error => record('pageerror', error.stack ?? error.message));
  page.on('console', message => {
    if (message.type() === 'error') record('console', message.text());
  });
  return { snapshot: () => ({ count, errors, truncated: count > errors.length }) };
}
