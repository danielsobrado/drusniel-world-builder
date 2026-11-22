import { createReadStream, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { ApiError, failure, ok, sendJson } from './api/responses.js';
import { createRoutes, matchRoute } from './api/routes.js';
import { log } from './log.js';

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };

/** Serves only files inside the built frontend directory; unknown paths get index.html. */
function serveStatic(staticDir, pathname, res) {
  const root = path.resolve(staticDir);
  let file = path.resolve(root, `.${decodeURIComponent(pathname)}`);
  const relative = path.relative(root, file);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new ApiError(400, 'invalid_path', 'Path escapes the frontend bundle');
  if (!existsSync(file) || !statSync(file).isFile()) file = path.join(root, 'index.html');
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
}

export function createApp(model, { staticDir = null } = {}) {
  const routes = createRoutes(model);
  const world = { mapId: model.audit.identity.mapId, sourceFingerprint: model.audit.identity.sourceFingerprint };

  return function handle(req, res) {
    const url = new URL(req.url, 'http://localhost');
    try {
      if (req.method !== 'GET' && req.method !== 'HEAD') throw new ApiError(405, 'method_not_allowed', 'The API is read-only');
      if (url.pathname.startsWith('/api/')) {
        const route = matchRoute(routes, url.pathname);
        if (!route) throw new ApiError(404, 'not_found', `No endpoint ${url.pathname}`);
        const { data, meta } = route.handler(url, route.match);
        return sendJson(res, 200, ok(world, data, meta));
      }
      if (staticDir && existsSync(staticDir)) return serveStatic(staticDir, url.pathname, res);
      throw new ApiError(404, 'not_found', 'Frontend is not built; run npm run build or use npm run dev');
    } catch (error) {
      if (error instanceof ApiError) return sendJson(res, error.status, failure(error.code, error.message, error.details));
      log.error('request failed', error, { method: req.method, path: url.pathname });
      return sendJson(res, 500, failure('internal_error', 'Unexpected server error'));
    }
  };
}
