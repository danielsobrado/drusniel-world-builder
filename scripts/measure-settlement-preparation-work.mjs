import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Scene } from 'three/webgpu';

const baseline = process.argv[2];
if (!baseline) throw new Error('Pass the baseline directory containing src.');
const load = (root, file) => import(pathToFileURL(path.resolve(root, 'src/editor', file)).href);
const [{ serializeSettlementRegistry }, { generateSettlementPlan }] = await Promise.all([
  load('.', 'world/settlements/SettlementRegistry.js'), load('.', 'world/settlements/SettlementPlanRequest.js'),
]);
const settlements = Array.from({ length: 1000 }, (_, id) => ({ id, population: .3,
  cellX: (id % 40) * 64, cellZ: Math.floor(id / 40) * 64 }));
const options = { settlements, tileSize: 2, worldSeed: 7, sampleGround: () => 4, landSearchStepCells: 32 };

async function measure(root, cached) {
  const [{ SettlementField }, { WorldChunkWorkerClient }, { ProceduralWorldGenerator },
    { SettlementSkyline }, { SettlementPlanPreparation }] = await Promise.all([
    load(root, 'world/settlements/SettlementField.js'), load(root, 'world/WorldChunkWorkerClient.js'),
    load(root, 'world/ProceduralWorldGenerator.js'), load(root, 'world/settlements/view/SettlementSkyline.js'),
    load(root, 'world/settlements/view/SettlementPlanPreparation.js'),
  ]);
  let probes = 0;
  const buildable = (x, z) => { probes++; return Math.sin(x * .01) + Math.cos(z * .01) > -.5; };
  const prepared = new SettlementField({ ...options, isBuildable: buildable });
  const preparationProbes = probes;
  let field = prepared;
  if (cached) field = SettlementField.fromRegistry(JSON.parse(JSON.stringify(serializeSettlementRegistry(prepared, 'fixture'))),
    { sampleGround: options.sampleGround, isBuildable: () => { probes++; return true; } });
  const before = probes; field.entriesNear(640, 400, 80);
  const registry = { entries: prepared.entries.length, coastlineProbesOnFirstUse: cached ? probes - before : preparationProbes,
    coastlineProbesInWorkerPreparation: cached ? preparationProbes : 0,
    resolvedEntriesAfterLocalQuery: cached ? field.resolvedEntries.size : field.entries.length };

  const previous = globalThis.Worker, workers = [];
  globalThis.Worker = class {
    constructor() { this.posted = []; this.listeners = {}; workers.push(this); }
    addEventListener(type, listener) { this.listeners[type] = listener; }
    postMessage(message) { this.posted.push(message); }
    terminate() {}
  };
  let capacity;
  try {
    const client = new WorldChunkWorkerClient({ chunkSize: 4, generator: new ProceduralWorldGenerator({ seed: 7 }), workerCount: 8 });
    const terrainWorkers = [...workers];
    const tasks = Array.from({ length: 8 }, (_, settlementPlanId) => client.request(0, 0, { settlementPlanId }).catch(() => null));
    tasks.push(client.request(42, 7, { priority: -1000 }).catch(() => null));
    capacity = { cityBurst: 8, terrainWorkers: terrainWorkers.length,
      terrainWorkersOccupiedByPlans: terrainWorkers.filter(w => w.posted.some(m => m.request?.settlementPlanId != null)).length,
      terrainRequestDispatchedImmediately: terrainWorkers.some(w => w.posted.some(m => m.request?.chunkX === 42)),
      dedicatedSettlementWorkers: workers.length - terrainWorkers.length };
    client.dispose(); await Promise.all(tasks);
  } finally { globalThis.Worker = previous; }

  const [{ SettlementField: CurrentField }] = await Promise.all([load('.', 'world/settlements/SettlementField.js')]);
  const city = new CurrentField({ settlements: [{ id: 18, cellX: 0, cellZ: 0, population: 28, capital: true,
    walls: true, citadel: true, plaza: true }], tileSize: 2, worldSeed: 7, sampleGround: () => 4, isBuildable: () => true });
  const response = generateSettlementPlan({ ensureSettlementField: () => city }, 18), actualBuildings = response.plan.buildings;
  let massed = 0;
  const buildings = new Proxy(actualBuildings, { get(target, key) {
    if (key === Symbol.iterator) return function* () { for (const building of target) { massed++; yield building; } };
    return Reflect.get(target, key);
  } });
  const entry = { settlement: { id: 18, cellX: 0, cellZ: 0 }, plan: { ...response.plan, buildings }, skyline: response.skyline };
  const skyline = new SettlementSkyline({ scene: new Scene() });
  skyline.refresh({ entriesNear: () => [{ entry, distance: 1000 }] }, { x: 1000, z: 0 }, 2);
  let turns = 1;
  if (skyline.advance) while (skyline.pending) {
    let units = 0; skyline.advance(() => ++units > 2); assert.ok(++turns < 100);
  }
  const sky = { buildings: actualBuildings.length, mainThreadBuildingsMassed: massed,
    workerBuildingsMassed: cached ? actualBuildings.length : 0, installationTurns: turns,
    vertices: skyline.towns.get(18).mesh.geometry.getAttribute('position').count };
  skyline.dispose();

  let now = 0, requests = 0;
  const planEntry = { settlement: { id: 18 }, plan: undefined, index: null };
  const owner = new SettlementPlanPreparation(() => {}, { now: () => now });
  owner.configure({}, { chunkWorker: { request: async () => {
    if (++requests === 1) throw Object.assign(new Error('worker restarted'), { retryable: true }); return response;
  } } });
  owner.get(planEntry); await new Promise(done => setImmediate(done));
  now = 250; owner.get(planEntry); await new Promise(done => setImmediate(done)); owner.advance(() => false);
  const retry = { injectedTransientFailures: 1, requests, recoveredInPlace: Boolean(planEntry.plan) };
  owner.reset();
  return { registry, capacity, skyline: sky, retry };
}

const report = { kind: 'settlement-preparation-work-counts', timingAcceptance: 'unverified',
  baseline: await measure(baseline, false), candidate: await measure('.', true) };
assert.equal(report.baseline.skyline.vertices, report.candidate.skyline.vertices);
const output = process.argv[3] ?? 'tmp/settlement-preparation-work.json';
await fs.mkdir(path.dirname(output), { recursive: true }); await fs.writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
