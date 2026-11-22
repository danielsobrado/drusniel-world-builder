export const API_VERSION = 1;

export class ApiError extends Error {
  constructor(status, code, message, details = undefined) {
    super(message);
    Object.assign(this, { status, code, details });
  }
}

export function sendJson(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(text),
    'cache-control': 'no-store',
  });
  res.end(text);
}

export const ok = (world, data, meta = undefined) => ({ apiVersion: API_VERSION, world, data, ...(meta ? { meta } : {}) });
export const failure = (code, message, details) => ({ apiVersion: API_VERSION, error: { code, message, ...(details ? { details } : {}) } });
