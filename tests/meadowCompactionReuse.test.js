import assert from 'node:assert/strict';
import test from 'node:test';
import { Scene, MeshBasicMaterial } from 'three/webgpu';
import { createMeadowTemplate } from '../src/editor/stylized/meadow/meadowGrassGeometry.js';
import { createCompaction } from '../src/editor/stylized/meadow/meadowGrassCompaction.js';
import { compactionPrefix } from '../src/editor/stylized/meadow/MeadowCompactionPrefix.js';
import { MeadowTileLayer } from '../src/editor/stylized/meadow/MeadowTileLayer.js';

function assertOutput(actual, expected) {
  assert.equal(actual.count, expected.count);
  for (const [name, width] of [['position', 4], ['rotation', 2], ['data', 4]]) {
    assert.deepEqual(actual[name].slice(0, actual.count * width), expected[name].slice(0, expected.count * width));
  }
}

test('expanding and truncating a prepared meadow preserves exact survivors and samples only new ranks', () => {
  let samples = 0;
  const sample = (x, z, rank, ground) => {
    samples++;
    Object.assign(ground, { height: x * 0.2 + z * 0.3, strength: 0.8, shape: 2, path: 0.2 });
    return rank % 3 !== 0;
  };
  const low = createMeadowTemplate({ detail: 2, count: 100, tileSize: 8 });
  const high = createMeadowTemplate({ detail: 5, count: 400, tileSize: 8 });
  const options = { centerX: 16000004, centerZ: -7999996, sample };
  const small = createCompaction({ ...options, template: low }); small.advance();
  assert.equal(samples, 100);
  const large = createCompaction({ ...options, template: high, previous: { capacity: 100, output: small.output } });
  while (!large.done) large.advance(17);
  assert.equal(samples, 400);
  const expected = createCompaction({ ...options, template: high }); expected.advance();
  assertOutput(large.output, expected.output);
  assertOutput(compactionPrefix(large.output, 100), small.output);
  low.dispose(); high.dispose();
});

test('band changes reuse ground until its revision changes, preserving complete publications', () => {
  let band = 'high', revision = 0, samples = 0;
  const templates = {
    high: createMeadowTemplate({ detail: 5, count: 100, tileSize: 8 }),
    low: createMeadowTemplate({ detail: 2, count: 40, tileSize: 8 }),
  };
  const material = new MeshBasicMaterial();
  const layer = new MeadowTileLayer({ scene: new Scene(), name: 'test', tileSize: 8,
    templates, material, reach: 0, selectBand: nearest => nearest === 0 ? band : null,
    ground: { revisionAt: () => revision, forTile: () => ({ revision,
      sample: (_x, _z, rank, ground) => { samples++; ground.height = revision; return rank % 2 === 0; } }) } });
  const update = () => layer.update({ x: 4, z: 4 }, { x: 0, z: 0 }, Infinity);
  update(); const initial = [...layer.tiles.values()][0].output;
  assert.equal(samples, 100);
  band = 'low'; update();
  assert.equal(samples, 100);
  assert.equal([...layer.tiles.values()][0].output.count, 20);
  band = 'high'; update();
  assert.equal(samples, 100);
  assertOutput([...layer.tiles.values()][0].output, initial);
  revision++; update();
  assert.equal(samples, 200);
  assert.equal([...layer.tiles.values()][0].output.position[1], 1);
  assert.equal(layer.getState().building, 0);
  layer.dispose(); material.dispose();
});
