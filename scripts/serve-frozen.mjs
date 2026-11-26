// Serves the app for hardware QA with file watching off (`node scripts/serve-frozen.mjs [port]`):
// another session editing the checkout cannot reload the page mid-run. Restart it to pick up changes.
import { startFrozenViteServer } from './lib/wsc-capture.mjs';

const server = await startFrozenViteServer(Number(process.argv[2]) || 5198);
console.log(`frozen app on http://127.0.0.1:${server.httpServer.address().port}`);
