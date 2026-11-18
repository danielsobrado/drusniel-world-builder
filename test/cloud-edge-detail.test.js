import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { vec2 } from 'three/tsl';
import { cloudEdgeDetail } from '../src/editor/stylized/sky/cloudEdgeDetail.js';
import { acquireWorldNoise } from '../src/editor/stylized/worldNoise.js';

test('cloud edges are eroded by the world-noise sky layer, not procedural octaves', async () => {
  const sky = await readFile(new URL('../src/editor/stylized/StylizedSkyView.js', import.meta.url), 'utf8');
  assert.match(sky, /cloudEdgeDetail\(cloudUv, look\.cloudDetail\)/);
  const source = await readFile(new URL('../src/editor/stylized/sky/cloudEdgeDetail.js', import.meta.url), 'utf8');
  assert.match(source, /depth\(sky\)/);
  assert.doesNotMatch(source, /mx_noise|stylizedFbm/);
});

test('cloud edge detail builds a node over the shared noise texture', () => {
  const node = cloudEdgeDetail(vec2(0.25, 0.75), 1);
  assert.ok(node?.isNode, 'returns a TSL node');
  // Before the file arrives the array is filled with each field's mean, so a cloud draws whole.
  const { texture } = acquireWorldNoise();
  assert.equal(texture.image.data[0], 128);
});
