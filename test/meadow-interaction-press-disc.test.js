import assert from 'node:assert/strict';
import test from 'node:test';
import { MeadowInteractionMap } from '../src/editor/stylized/meadow/MeadowInteractionMap.js';

function texelAt(map, x, z) {
  const px = Math.floor(((x - map.center.x) / map.worldSize + 0.5) * map.resolution);
  const py = Math.floor(((z - map.center.y) / map.worldSize + 0.5) * map.resolution);
  return map.pixels[(py * map.resolution + px) * 4];
}

test('pressDisc flattens a plateau that fades to the rim and recovers', () => {
  const map = new MeadowInteractionMap({ getHeight: () => 0 });
  map.pressDisc(2, -1, 4, 1, 0.5);
  assert.equal(texelAt(map, 2, -1), 255);
  assert.ok(texelAt(map, 2 + 1.5, -1) > 240, 'plateau inside the inner fraction');
  assert.ok(texelAt(map, 2 + 3.6, -1) < 80, 'fades toward the rim');
  assert.equal(texelAt(map, 2 + 4.5, -1), 0);
  assert.ok(map.texture.needsUpdate !== false);
  map.update(null);
  assert.ok(texelAt(map, 2, -1) < 255, 'the grass starts standing back up');
});

test('pressDisc ignores discs off the window and empty strength', () => {
  const map = new MeadowInteractionMap({ getHeight: () => 0 });
  map.pressDisc(500, 500, 3, 1);
  map.pressDisc(0, 0, 3, 0);
  assert.equal(map.peak, 0);
});
