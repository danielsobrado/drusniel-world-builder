import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { settlementReviewMetadata as metadata, settlementReviewSource } from './lib/settlement-review-fixture.mjs';

const baseline = process.argv[2];
if (!baseline) throw new Error('Pass the directory containing the baseline src snapshot.');
const load = (root, file) => import(pathToFileURL(path.resolve(root, 'src', file)).href);
const source = settlementReviewSource(2000, 2000); // Importer's maximum four million cells.

async function fingerprint(root) {
  const { AzgaarMacroWorldGenerator } = await load(root, 'editor/world/AzgaarMacroWorldGenerator.js');
  const { settlementRegistryKey } = await load(root, 'editor/world/settlements/SettlementRegistry.js');
  const stringify = JSON.stringify; let characters = 0;
  JSON.stringify = function(value, ...args) {
    const text = stringify(value, ...args);
    if (Array.isArray(value) && value.includes(source.settlements)) characters += text.length;
    return text;
  };
  let generator, constructionMs;
  try {
    const started = performance.now(); generator = new AzgaarMacroWorldGenerator(source, metadata);
    constructionMs = performance.now() - started;
  } finally { JSON.stringify = stringify; }
  const started = performance.now(), key = settlementRegistryKey(source, metadata.seed);
  assert.equal(generator.settlementRegistryKey, key);
  return { atlasCells: 4_000_000, synchronousFingerprintCharacters: characters,
    constructionMs, isolatedFingerprintMs: performance.now() - started };
}

async function duplicates(root, shared) {
  const { SettlementField } = await load(root, 'editor/world/settlements/SettlementField.js');
  let planned = 0, groundSamples = 0;
  const make = () => {
    const field = new SettlementField({ settlements: source.settlements, tileSize: 2, worldSeed: 91,
      sampleGround: () => { groundSamples++; return 0; }, isBuildable: () => true });
    const ensure = field.ensurePlan.bind(field);
    field.ensurePlan = entry => { if (entry.plan === undefined) planned++; return ensure(entry); };
    return { settlementRegistryKey: 'fixture-91', ensureSettlementField: () => field };
  };
  if (!shared) {
    for (let worker = 0; worker < 9; worker++) { const generator = make(), field = generator.ensureSettlementField(); field.ensurePlan(field.findById(18)); }
  } else {
    const { SettlementPlanPortAuthority, SettlementPlanPortClient } = await load(root, 'editor/world/settlements/SettlementPlanPorts.js');
    const generator = make(), authority = new SettlementPlanPortAuthority(() => generator);
    authority.reset(1); const clients = [];
    try {
      const requests = Array.from({ length: 8 }, () => {
        const channel = new MessageChannel(), client = new SettlementPlanPortClient();
        authority.connect(channel.port1, 1); client.connect(channel.port2, 1); clients.push(client);
        return client.prepare(make(), metadata, 18);
      });
      await Promise.all(requests);
      const field = generator.ensureSettlementField(); field.ensurePlan(field.findById(18));
    } finally { clients.forEach(client => client.disconnect()); authority.reset(2); }
  }
  return { terrainWorkers: 8, visualWorkers: 1, planned, groundSamples };
}

const report = { kind: 'third-review-work-counts', hardwareAcceptance: false,
  baseline: { fingerprint: await fingerprint(baseline), planning: await duplicates(baseline, false) },
  candidate: { fingerprint: await fingerprint('.'), planning: await duplicates('.', true) } };
const output = process.argv[3] ?? 'tmp/third-review-work.json';
await mkdir(path.dirname(output), { recursive: true }); await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
