#!/usr/bin/env node
/**
 * Compiles config/settlement-gates.yaml to plain data the planner can import in
 * a terrain worker or under `node --test`, where `?compiled` YAML does not load.
 *
 * npm run generate:settlement-gates   (--check fails if stale)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = path.join(rootDir, 'config/settlement-gates.yaml');
const OUTPUT = path.join(rootDir, 'src/editor/world/settlements/SettlementGateProfiles.generated.js');

const { default: fallback, families } = yaml.load(fs.readFileSync(SOURCE, 'utf8'));
const text = `// Generated from config/settlement-gates.yaml by scripts/generate-settlement-gates.mjs. Do not edit.
export const SETTLEMENT_GATE_PROFILES = ${JSON.stringify({ default: fallback, families }, null, 2)};
`;

if (process.argv.includes('--check')) {
  if (fs.readFileSync(OUTPUT, 'utf8').replaceAll('\r\n', '\n') !== text) {
    console.error('SettlementGateProfiles.generated.js is stale: run npm run generate:settlement-gates');
    process.exit(1);
  }
} else {
  fs.writeFileSync(OUTPUT, text);
}
