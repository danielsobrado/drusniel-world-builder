import { createServer } from 'node:http';
import path from 'node:path';
import { loadConfig } from './config/loadConfig.js';
import { buildWorldModel } from './world/WorldModel.js';
import { createApp } from './app.js';
import { log } from './log.js';

try {
  const config = loadConfig();
  const started = performance.now();
  const model = buildWorldModel(config);
  log.info('world loaded', {
    mapId: model.audit.identity.mapId,
    sourceFingerprint: model.audit.identity.sourceFingerprint,
    settlements: model.audit.counts.settlements,
    ms: Math.round(performance.now() - started),
  });
  const staticDir = process.argv.includes('--serve-frontend') ? path.join(config.root, 'frontend/dist') : null;
  const { host, port } = config.simulator.server;
  const server = createServer(createApp(model, { staticDir }));
  server.on('error', (error) => { log.error('server error', error, { host, port }); process.exit(1); });
  server.listen(port, host, () => log.info('backend listening', { url: `http://${host}:${port}`, servesFrontend: Boolean(staticDir) }));
  const stop = () => server.close(() => process.exit(0));
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
} catch (error) {
  log.error('backend failed to start', error);
  process.exit(1);
}
