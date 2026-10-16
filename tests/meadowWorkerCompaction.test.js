import assert from 'node:assert/strict';
import test from 'node:test';
import { MeshBasicMaterial, Scene } from 'three/webgpu';
import { MeadowCompactionPool } from '../src/editor/stylized/meadow/MeadowCompactionPool.js';
import { MeadowGroundSampler } from '../src/editor/stylized/meadow/MeadowGroundSampler.js';
import { MeadowTileLayer } from '../src/editor/stylized/meadow/MeadowTileLayer.js';
import { createCompaction } from '../src/editor/stylized/meadow/meadowGrassCompaction.js';
import { buildMeadowCompaction } from '../src/editor/stylized/meadow/buildMeadowCompaction.js';
import { createMeadowTemplate } from '../src/editor/stylized/meadow/meadowGrassGeometry.js';
import { resolveMeadowGrassConfig } from '../src/editor/stylized/meadow/meadowGrassConfig.js';

function fixture(t, { centerX = 4, centerZ = -4 } = {}) {
  const chunkSize = 16, tileSize = 2, originX = Math.floor(centerX / 32) * 32;
  const originZ = Math.floor(-centerZ / 32) * 32;
  const descriptor = { key: 'ground', chunkX: originX / 32, chunkZ: originZ / 32,
    originCellX: originX / 2, originCellZ: originZ / 2,
    centerWorldX: originX + 16, centerWorldZ: -originZ - 16 };
  const page = { tiles: new Uint8Array(256).fill(5), heights: new Float32Array(17 ** 2),
    surfaceMaskPixels: new Uint8Array(256 * 4) };
  for (let i = 0; i < page.heights.length; i++) page.heights[i] = Math.sin(i * 0.7) * 3;
  for (let i = 0; i < 256; i++) {
    if (i % 11 === 0) page.tiles[i] = 0;
    page.surfaceMaskPixels.set([i % 7 === 0 ? 180 : 0, 160 + i % 96, i % 13 === 0 ? 180 : 0, 255], i * 4);
  }
  const slot = { descriptor, page, pageRevision: 1 };
  const ground = new MeadowGroundSampler({ terrainView: { slots: [slot], contentRevision: 1,
    worldStore: { chunkSize, tileSize, generator: { toMetadata: () => ({ seed: 19 }) } } },
  tileIds: [5], shapeTable: new Uint8Array(256).fill(2), forestFloorConfig: {},
  forestFieldProvider: () => ({ sample: (x, z) => ({ patchId: 'woods', patchCoverage: 0.4 + Math.sin(x + z) * 0.2, patchEdge: 0.4 }) }),
  pathConfig: { naturalTrail: { enabled: true } },
  rockPlacementsProvider: () => [{ stableId: 'rock', x: centerX + 1, z: centerZ - 1, radius: 0.6 }],
  rocks: { radius: 1, falloff: 1, flatten: 0.8 } });
  ground.beginFrame();
  const sampled = ground.forTile(centerX, centerZ, 4);
  const low = createMeadowTemplate({ detail: 2, count: 512, tileSize: 8 });
  const high = createMeadowTemplate({ detail: 5, count: 2048, tileSize: 8 });
  t.after(() => { low.dispose(); high.dispose(); });
  return { low, high, ground, sampled, options: { template: high, centerX, centerZ,
    sample: sampled.sample, snapshot: sampled.snapshot } };
}

function assertOutput(actual, expected) {
  assert.equal(actual.count, expected.count);
  assert.equal(actual.minHeight, expected.minHeight);
  assert.equal(actual.maxHeight, expected.maxHeight);
  for (const [name, width] of [['position', 4], ['rotation', 2], ['data', 4]]) {
    assert.deepEqual(actual[name].subarray(0, actual.count * width), expected[name].subarray(0, expected.count * width));
  }
}

class FakeWorker {
  constructor() { this.listeners = {}; this.templates = new Map(); this.jobs = []; }
  addEventListener(name, listener) { this.listeners[name] = listener; }
  postMessage(message, transfer = []) {
    const copy = structuredClone(message, { transfer });
    if (copy.type === 'template') this.templates.set(copy.id, copy.definition);
    else this.jobs.push(copy);
  }
  respond() {
    const request = this.jobs.shift();
    const result = buildMeadowCompaction(request, this.templates.get(request.templateId));
    this.listeners.message({ data: structuredClone(result, { transfer: ['position', 'rotation', 'data'].map(name => result.output[name].buffer) }) });
  }
  terminate() { this.terminated = true; }
}

function poolFixture(t) {
  const workers = [];
  const pool = new MeadowCompactionPool({ workerFactory: () => { const worker = new FakeWorker(); workers.push(worker); return worker; } });
  t.after(() => pool.dispose());
  return { pool, workers };
}

for (const pose of [{ centerX: 4, centerZ: -4 }, { centerX: 16000004, centerZ: -7999996 }]) {
  test(`worker output matches main-thread canopy, paths, rocks and wind at ${pose.centerX}`, t => {
    const { options } = fixture(t, pose), { pool, workers } = poolFixture(t);
    const expected = createCompaction(options); expected.advance();
    assert.ok(expected.output.count > 50, 'the fixture produces visible grass');
    const task = pool.create(options); task.advance(); workers[0].respond();
    assert.equal(task.done, true);
    assertOutput(task.output, expected.output);
  });
}

test('worker snapshots preserve mixed biome shapes, thin grass islands and canopy patches', t => {
  const { ground, options } = fixture(t);
  const settings = resolveMeadowGrassConfig({ shapes: { byTileId: { 10: 'reed' } } });
  ground.eligible[4] = 1;
  ground.eligible[10] = 1;
  ground.setGrowth(settings.growth, settings.shapeTable);
  const page = ground.terrainView.slots[0].page;
  for (let i = 0; i < page.tiles.length; i++) {
    if (page.tiles[i] !== 0) page.tiles[i] = i % 16 < 2 ? 4 : 10;
  }
  ground.beginFrame();
  const sampled = ground.forTile(options.centerX, options.centerZ, 4);
  const mixedOptions = { ...options, sample: sampled.sample, snapshot: sampled.snapshot };
  const expected = createCompaction(mixedOptions); expected.advance();
  const shapes = new Set(Array.from({ length: expected.output.count }, (_, i) => Math.floor(expected.output.data[i * 4])));
  assert.ok(shapes.has(settings.shapeTable[4]), 'grassland keeps its appearance');
  assert.ok(shapes.has(settings.shapeTable[10]), 'thin grass keeps its appearance');
  const { pool, workers } = poolFixture(t);
  const task = pool.create(mixedOptions); task.advance(); workers[0].respond();
  assert.equal(task.done, true);
  assertOutput(task.output, expected.output);
});

test('worker promotion keeps its completed prefix and has a bounded number of dispatched jobs', t => {
  const { options, low, high } = fixture(t), { pool, workers } = poolFixture(t);
  const task = pool.create({ ...options, template: low });
  const second = pool.create(options), third = pool.create(options);
  task.advance(); second.advance(); third.advance();
  assert.equal(pool.pending.size, 2);
  assert.equal(third.pending, false);
  task.promote(high);
  workers[0].respond();
  assert.equal(task.done, false, 'the smaller in-flight result cannot publish as a denser tile');
  assert.equal(task.processedCount, 512);
  task.advance(); workers[0].respond();
  assert.equal(task.done, true);
  const expected = createCompaction(options); expected.advance();
  assertOutput(task.output, expected.output);
  third.advance(); assert.equal(third.pending, true);
});

test('cancellation recycles each private result once and leaves published prefixes intact', t => {
  const { options, low, high } = fixture(t), { pool, workers } = poolFixture(t);
  const prefix = createCompaction({ ...options, template: low }); prefix.advance();
  const published = prefix.output.position.slice();
  const recycled = [];
  const task = pool.create({ ...options, previous: { output: prefix.output, capacity: 512 },
    recycle: output => recycled.push(output) });
  task.advance(); task.cancel(); task.cancel(); workers[0].respond();
  assert.equal(recycled.length, 1);
  assert.notEqual(recycled[0], prefix.output);
  assert.deepEqual(prefix.output.position, published);
  assert.equal(task.output, null);

  const promoted = pool.create({ ...options, template: low, recycle: output => recycled.push(output) });
  promoted.advance(); workers[0].respond();
  promoted.promote(high); promoted.advance(); promoted.cancel(); workers[0].respond();
  assert.equal(recycled.length, 3);
  assert.equal(new Set(recycled).size, 3);
});

test('worker failure resumes bounded main-thread compaction and clears pending work', t => {
  const { options } = fixture(t), { pool, workers } = poolFixture(t);
  const task = pool.create(options); task.advance();
  workers[0].listeners.error();
  assert.equal(pool.pending.size, 0);
  assert.equal(workers.every(worker => worker.terminated), true);
  task.advance(17);
  assert.equal(task.processedCount, 17);
  while (!task.done) task.advance(17);
  const expected = createCompaction(options); expected.advance();
  assertOutput(task.output, expected.output);
});

test('cards retain a worker turn while blade preparation is continuously busy', t => {
  const { options } = fixture(t), { pool, workers } = poolFixture(t);
  const card = createMeadowTemplate({ detail: 1, count: 128, tileSize: 8, cards: true });
  t.after(() => card.dispose());
  pool.register(card);
  pool.create(options).advance(); pool.create(options).advance();
  const task = pool.create({ ...options, template: card }); task.advance();
  assert.equal(workers[0].jobs.length, 1);
  assert.equal(workers[1].jobs.length, 1);
  workers[1].respond();
  const expected = createCompaction({ ...options, template: card }); expected.advance();
  assertOutput(task.output, expected.output);
});

test('edits retain published grass and reject a superseded worker result arriving late', t => {
  const { high, ground } = fixture(t), { pool, workers } = poolFixture(t);
  const material = new MeshBasicMaterial();
  const layer = new MeadowTileLayer({ scene: new Scene(), name: 'edit', tileSize: 8,
    templates: { high }, material, reach: 0, selectBand: nearest => nearest === 0 ? 'high' : null,
    ground, preparer: pool });
  t.after(() => { layer.dispose(); material.dispose(); });
  const update = () => layer.update({ x: 4, z: -4 }, { x: 0, z: 0 }, Infinity, 1);
  update(); workers[0].respond(); update();
  const tile = layer.tiles.get('0:-1'), publication = tile.output;
  const previousPositions = publication.position.slice();
  const edit = height => {
    const view = ground.terrainView;
    view.slots[0].page.heights.fill(height);
    view.slots[0].pageRevision++;
    view.contentRevision++;
    ground.beginFrame(); update();
  };
  edit(7); edit(11);
  workers[0].respond(); update();
  assert.equal(tile.output, publication, 'the late result cannot replace visible grass');
  assert.deepEqual(publication.position, previousPositions, 'pooled results cannot overwrite a live publication');
  workers[1].respond(); update();
  assert.equal(tile.builtRevision, tile.revision);
  for (let i = 0; i < tile.output.count; i++) assert.equal(tile.output.position[i * 4 + 1], 11);
});
