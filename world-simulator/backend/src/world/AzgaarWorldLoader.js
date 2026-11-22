import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

export const SUPPORTED_FORMAT = 'azgaar-full-json';

function fail(message) {
  const error = new Error(`Azgaar source invalid: ${message}`);
  error.code = 'invalid_source';
  return error;
}

/** Resolves a manifest entry to a file that must stay inside the maps directory. */
export function resolveMapEntry({ manifestPath, mapsDirectory, mapId }) {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const entry = (manifest.maps ?? []).find((map) => map.id === mapId);
  if (!entry) throw new Error(`Map "${mapId}" is not listed in ${path.basename(manifestPath)}`);
  if (entry.format !== SUPPORTED_FORMAT) throw new Error(`Map "${mapId}" has format ${entry.format}; only ${SUPPORTED_FORMAT} is supported`);
  const root = path.resolve(mapsDirectory);
  const file = path.resolve(root, entry.url);
  if (path.relative(root, file).startsWith('..') || path.isAbsolute(path.relative(root, file))) {
    throw new Error(`Map "${mapId}" resolves outside the maps directory`);
  }
  return { ...entry, file };
}

/** Checks the fields the audit reads; throws with the first problem found. */
export function validateAzgaarDocument(document) {
  if (!document || typeof document !== 'object') throw fail('document is not an object');
  const { info, settings, pack } = document;
  if (!(info?.width > 0 && info?.height > 0)) throw fail('info.width/height must be positive');
  if (!(Number(settings?.populationRate) > 0)) throw fail('settings.populationRate must be positive');
  if (!(Number(settings?.urbanization) > 0)) throw fail('settings.urbanization must be positive');
  for (const key of ['cells', 'burgs', 'states', 'provinces', 'cultures']) {
    if (!Array.isArray(pack?.[key]) || pack[key].length === 0) throw fail(`pack.${key} must be a non-empty array`);
  }
  for (const key of ['routes', 'goods', 'markets']) {
    if (pack[key] != null && !Array.isArray(pack[key])) throw fail(`pack.${key} must be an array`);
  }
  pack.cells.forEach((cell, index) => {
    if (cell?.i !== index) throw fail(`pack.cells[${index}] has id ${cell?.i}; cells must be indexed by id`);
  });
  return document;
}

/** Reads and validates the source map. The file is never written. */
export function loadAzgaarWorld({ manifestPath, mapsDirectory, mapId }) {
  const entry = resolveMapEntry({ manifestPath, mapsDirectory, mapId });
  const bytes = readFileSync(entry.file);
  let document;
  try {
    document = JSON.parse(bytes.toString('utf8'));
  } catch (error) {
    throw fail(`JSON parse failed (${error.message})`);
  }
  validateAzgaarDocument(document);
  return {
    identity: {
      mapId: entry.id,
      name: entry.name,
      format: entry.format,
      fileName: path.basename(entry.file),
      sourceFingerprint: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
      azgaarVersion: document.info.version ?? null,
      seed: document.info.seed ?? null,
      azgaarMapId: document.info.mapId ?? null,
      exportedAt: document.info.exportedAt ?? null,
    },
    document,
  };
}
