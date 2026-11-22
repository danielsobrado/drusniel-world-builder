import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { canonicalize } from '../../../../src/sim/persistence/canonicalSerialize.js';

/** Sorted-key JSON with a trailing newline: identical inputs give identical bytes. */
export function canonicalJson(value) {
  return `${JSON.stringify(canonicalize(value), null, 2)}\n`;
}

export function writeReports(reports, directory) {
  mkdirSync(directory, { recursive: true });
  return Object.entries(reports).sort(([a], [b]) => a.localeCompare(b)).map(([name, report]) => {
    const text = canonicalJson(report);
    writeFileSync(path.join(directory, name), text);
    return { name, bytes: Buffer.byteLength(text) };
  });
}
