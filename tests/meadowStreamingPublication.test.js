import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import { Scene, MeshBasicMaterial } from 'three/webgpu';
import { createMeadowTemplate } from '../src/editor/stylized/meadow/meadowGrassGeometry.js';
import { MeadowTileLayer } from '../src/editor/stylized/meadow/MeadowTileLayer.js';

test('grass prepares higher density before its visible boundary without promoting the drawn band', () => {
  const samples = new Map();
  const templates = {
    high: createMeadowTemplate({ detail: 5, count: 100, tileSize: 8 }),
    low: createMeadowTemplate({ detail: 2, count: 40, tileSize: 8 }),
  };
  const material = new MeshBasicMaterial();
  const layer = new MeadowTileLayer({ scene: new Scene(), name: 'ahead', tileSize: 8,
    templates, material, reach: 24,
    selectBand: distance => distance < 64 ? 'high' : distance < 256 ? 'low' : null,
    selectPreparationBand: distance => distance < 256 ? 'high' : distance < 576 ? 'low' : null,
    ground: { revisionAt: () => 'ground:0', forTile: (x, z) => ({ revision: 'ground:0',
      sample: (_x, _z, rank, out) => {
        const key = `${x}:${z}`; samples.set(key, (samples.get(key) ?? 0) + 1);
        Object.assign(out, { height: 2, strength: 1, shape: 0, path: 0 });
        return rank % 2 === 0;
      } }) } });
  layer.update({ x: 4, z: 4 }, { x: 0, z: 0 }, Infinity, 1);
  const tile = layer.tiles.get('2:0');
  assert.equal(tile.builtBand, 'low');
  assert.equal(tile.output.count, 20);
  assert.equal(tile.prepared.capacity, 100);
  assert.equal(samples.get('20:4'), 100);
  assert.strictEqual(tile.output.position.buffer, tile.prepared.output.position.buffer);
  const waiting = layer.tiles.get('3:0');
  assert.equal(waiting.band, null);
  assert.equal(waiting.output, null);
  assert.equal(waiting.prepared.capacity, 40, 'outside tiles warm up without drawing');
  // Cached publication is cheap LOD selection, even when generation has no time left.
  layer.update({ x: 9, z: 4 }, { x: 0, z: 0 }, -Infinity, 2);
  assert.equal(tile.builtBand, 'high');
  assert.equal(tile.output.count, 50);
  assert.equal(samples.get('20:4'), 100, 'crossing the boundary performs no new ground sampling');
  assert.equal(tile.revealRank, 40, 'already-present ranks keep their full coverage');
  assert.equal(tile.revealTime, 2);
  assert.equal(waiting.builtBand, 'low');
  assert.strictEqual(waiting.output.position.buffer, waiting.prepared.output.position.buffer,
    'the publication uses retained preparation rather than a recycled previous output');
  layer.dispose(); material.dispose();
  for (const template of Object.values(templates)) template.dispose();
});

test('limited compaction time fills a patch in front before an equally near patch behind', () => {
  let clock = 0;
  mock.method(performance, 'now', () => clock);
  const template = createMeadowTemplate({ detail: 2, count: 100, tileSize: 8 });
  const material = new MeshBasicMaterial();
  const layer = new MeadowTileLayer({ scene: new Scene(), name: 'visible', tileSize: 8,
    templates: { low: template }, material, reach: 24,
    selectBand: distance => distance >= 100 && distance < 200 ? 'low' : null,
    ground: { revisionAt: () => 'ground:0', forTile: () => ({ revision: 'ground:0',
      sample: (_x, _z, _rank, out) => {
        clock += 0.01;
        Object.assign(out, { height: 2, strength: 1, shape: 0, path: 0 });
        return true;
      } }) } });
  try {
    layer.update({ x: 4, z: 4 }, { x: 0, z: 0 }, 0.5, 1,
      { x: 0, z: 1, tangent: 0.5 });
    assert.equal(layer.tiles.get('0:2').output.count, 100);
    assert.equal(layer.tiles.get('0:-2').output, null);
    // Turning around redirects the next slice; queued work is retained.
    layer.update({ x: 4, z: 4 }, { x: 0, z: 0 }, clock + 0.5, 2,
      { x: 0, z: -1, tangent: 0.5 });
    assert.equal(layer.tiles.get('0:-2').output.count, 100);
    assert.equal(layer.tiles.get('0:2').output.count, 100);
  } finally {
    mock.restoreAll(); layer.dispose(); material.dispose(); template.dispose();
  }
});

test('a no-longer-needed density job releases its buffer without blocking readiness or losing grass', () => {
  let clock = 0;
  mock.method(performance, 'now', () => clock);
  const templates = {
    low: createMeadowTemplate({ detail: 2, count: 40, tileSize: 8 }),
    high: createMeadowTemplate({ detail: 5, count: 400, tileSize: 8 }),
  };
  const material = new MeshBasicMaterial();
  const layer = new MeadowTileLayer({ scene: new Scene(), name: 'cancelled', tileSize: 8,
    templates, material, reach: 8, selectBand: distance => distance < 64 ? 'low' : null,
    ground: { revisionAt: () => 'ground:0', forTile: () => ({ revision: 'ground:0',
      sample: (_x, _z, _rank, out) => {
        clock += 0.01;
        Object.assign(out, { height: 2, strength: 1, shape: 0, path: 0 });
        return true;
      } }) } });
  try {
    layer.update({ x: 4, z: 4 }, { x: 0, z: 0 }, Infinity, 1);
    const tile = layer.tiles.get('0:0');
    const publication = tile.output;
    tile.preparationBand = 'high'; tile.preparationCapacity = 400;
    layer.buildTiles([tile], clock + 1);
    assert.ok(tile.job && !tile.job.compaction.done);
    const unusedBuffer = tile.job.compaction.output;
    tile.preparationBand = 'low'; tile.preparationCapacity = 40;
    // Layout changes cancel obsolete jobs before the budgeted build step.
    layer.rebuildStaleTiles();
    layer.build(-Infinity);
    assert.equal(tile.job, null);
    assert.strictEqual(tile.output, publication);
    assert.equal(tile.output.count, 40);
    assert.ok(layer.pools.get('high').includes(unusedBuffer));
    assert.equal(layer.getState().building, 0);
  } finally {
    mock.restoreAll(); layer.dispose(); material.dispose();
    for (const template of Object.values(templates)) template.dispose();
  }
});
