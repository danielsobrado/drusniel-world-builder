import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { BoxGeometry, Group, Matrix4, MeshBasicNodeMaterial, PerspectiveCamera, Vector3 } from 'three/webgpu';

// Node work-count comparison, never a frame-time or hardware acceptance result.
// Baseline: git archive <revision> src | tar -x -C tmp/critical-path-baseline
const baseline = process.argv[2];
if (!baseline) throw new Error('Pass the directory containing the baseline src snapshot.');
const output = process.argv[3] ?? 'tmp/critical-path-work.json';

async function measure(source) {
  const load = file => import(pathToFileURL(path.resolve(source, 'src/editor', file)).href);
  const [{ ObjectLodController }, lod, { SettlementView, SETTLEMENT_VIEW }, { InstanceAnchor },
    { MeadowGrassBatches }, { createMeadowTemplate }, { PerfCounters }] = await Promise.all([
    load('ObjectLodController.js'), load('stylized/lod/StylizedLodRuntime.js'),
    load('world/settlements/view/SettlementView.js'), load('stylized/lod/InstanceAnchor.js'),
    load('stylized/meadow/MeadowGrassBatches.js'), load('stylized/meadow/meadowGrassGeometry.js'),
    load('performance/qa/PerfCounters.js'),
  ]);
  let matricesRead = 0, classified = 0;
  const matrixAt = (x, z) => {
    const matrix = new Matrix4().makeTranslation(x, 0, z), elements = matrix.elements;
    Object.defineProperty(matrix, 'elements', { get() { matricesRead++; return elements; } });
    return matrix;
  };
  const geometry = new BoxGeometry(), material = new MeshBasicNodeMaterial(), root = new Group();
  const makeTier = name => ({ meshes: lod.createInstancedRenderers({ root,
    partsByPrototype: [[{ geometry, material }]], capacity: 1024, name })[0] });
  const controller = new ObjectLodController({ transitionMs: 1 });
  let records = new Map(Array.from({ length: 256 }, (_, id) => {
    const z = [-20, -80, -300][id % 3], position = new Vector3(id / 100, 0, z);
    return [id, { object: { id }, matrix: matrixAt(id / 100, z), worldHeight: 6,
      get worldPosition() { classified++; return position; } }];
  }));
  const publish = () => {
    if (controller.updatePlacements) controller.updatePlacements(records);
    else { controller.seed([...records.values()]); controller.invalidate(); }
  };
  const camera = new PerspectiveCamera(60, 1, .1, 1000);
  const plan = (timestamp, force = false) => controller.plan({ placements: [...records.values()], camera,
    viewportHeight: 1000, timestamp, force });
  publish(); plan(0); plan(2, true);
  const bands = ['near', 'coarse', 'shell'], tiers = Object.fromEntries(bands.map(b => [b, makeTier(b)]));
  const before = plan(100);
  for (const band of bands) lod.writeInstances([tiers[band].meshes], [before.buckets[band]]);
  const changed = records.get(1);
  records = new Map(records); records.set(1, { ...changed, matrix: matrixAt(1.5, -80),
    get worldPosition() { classified++; return new Vector3(1.5, 0, -80); } });
  matricesRead = 0; classified = 0; publish();
  const after = plan(120); let rewrittenBands = 0;
  for (const band of bands) {
    if (controller.updatePlacements && before.signatures[band] === after.signatures[band]) continue;
    rewrittenBands++;
    lod.writeInstances([tiers[band].meshes], [after.buckets[band]], null,
      after.changedRows ? [after.changedRows[band]] : null);
  }
  const objectEdit = { objects: records.size, classified, matricesRead, rewrittenBands };

  const entries = new Map(Array.from({ length: 3 }, (_, i) => [`house-${i}`,
    { state: 'ready', near: makeTier(`near-${i}`), far: makeTier(`far-${i}`) }]));
  const placements = Array.from({ length: 1000 }, (_, i) => ({ key: `house-${i % 3}`, kind: 'house',
    variant: 0, get x() { classified++; return i / 100; }, z: 0, small: false, blend: 0, shown: 0,
    near: { matrix: matrixAt(i / 100, 0), seed: i / 1000 }, far: { matrix: matrixAt(i / 100, 0), seed: i / 1000 } }));
  const view = { root, origin: { x: 0, z: 0 }, anchor: new InstanceAnchor(), rows: new Map(), culls: false,
    sites: new Map([[1, { id: 1, surfaces: {}, plan: { profile: { style: {} }, buildings: placements }, placements }]]),
    pool: { request: key => entries.get(key), tier: (entry, band) => entry[band] } };
  const select = controller.updatePlacements ? (await load('world/settlements/view/SettlementSelection.js')).settlementSelectionJob : null;
  let largestUnit = 0;
  const cycle = timestamp => {
    if (!select) { SettlementView.prototype.select.call(view, { x: 0, z: 0 }, .1); largestUnit = Math.max(largestUnit, placements.length); return; }
    const job = select(view, { x: 0, z: 0 }, timestamp, SETTLEMENT_VIEW);
    for (;;) {
      const start = classified, step = job.next(); largestUnit = Math.max(largestUnit, classified - start);
      if (step.done) break;
    }
  };
  for (const time of [0, 100, 200, 300, 400]) cycle(time);
  matricesRead = 0; classified = 0; cycle(500);
  assert.equal(view.visibleBuildings, 1000);
  const settlement = { placements: 1000, largestClassificationUnit: largestUnit,
    settledCycleClassified: classified, settledCycleMatricesRead: matricesRead };

  const template = createMeadowTemplate({ detail: 2, count: 4096, tileSize: 8 });
  const batches = new MeadowGrassBatches({ scene: root, templates: { low: template }, material, name: 'churn' });
  const tiles = Array.from({ length: 48 }, (_, i) => ({ buildId: 1, builtBand: 'low', renderX: i * 8, renderZ: 0,
    output: { count: 1024 + i % 5 * 128, position: new Float32Array(4096 * 4).fill(i),
      rotation: new Float32Array(4096 * 2), data: new Float32Array(4096 * 4) } }));
  const commit = (members, budget) => { batches.begin(); for (const tile of members) batches.add('low', tile); batches.commit(budget); };
  commit(tiles);
  const survivors = tiles.filter((_, i) => i % 16 !== 1);
  const budget = controller.updatePlacements ? new (await load('stylized/meadow/MeadowPublicationBudget.js')).MeadowPublicationBudget(768 * 1024) : null;
  const repackBytesPerFrame = [];
  do {
    budget?.reset(768 * 1024); PerfCounters.reset(); commit(survivors, budget);
    repackBytesPerFrame.push(PerfCounters.get('meadowRepackBytes'));
    assert.ok(repackBytesPerFrame.length < 10, 'retirement recovers');
  } while (batches.pending);
  const stems = batches.meshes.reduce((sum, mesh) => sum + mesh.geometry.instanceCount, 0);
  assert.equal(stems, survivors.reduce((sum, tile) => sum + tile.output.count, 0));
  const grass = { sourceTiles: 48, survivingTiles: survivors.length, stems, repackBytesPerFrame };
  batches.dispose(); template.dispose();
  for (const tier of [...Object.values(tiers), ...[...entries.values()].flatMap(e => [e.near, e.far])]) lod.disposeInstancedRenderers(root, [tier.meshes]);
  geometry.dispose(); material.dispose();
  return { objectEdit, settlement, grass };
}

const report = { kind: 'critical-path-work-counts', timingAcceptance: 'unverified',
  baseline: await measure(baseline), candidate: await measure(process.cwd()) };
await fs.mkdir(path.dirname(output), { recursive: true });
await fs.writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
