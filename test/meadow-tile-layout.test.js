import assert from 'node:assert/strict';
import test from 'node:test';
import { MeshBasicNodeMaterial, Scene } from 'three/webgpu';

import { MeadowTileLayer } from '../src/editor/stylized/meadow/MeadowTileLayer.js';
import { createMeadowTemplate } from '../src/editor/stylized/meadow/meadowGrassGeometry.js';

const SLICE = { revision: 1, sample: (_x, _z, _rank, out) => {
  Object.assign(out, { height: 2, strength: 1, shape: 0, path: 0 });
  return true;
} };

function layerWith(options) {
  const template = createMeadowTemplate({ detail: 2, count: 16, tileSize: 8 });
  const material = new MeshBasicNodeMaterial();
  const layer = new MeadowTileLayer({ scene: new Scene(), name: 'layout', tileSize: 8,
    templates: { high: template, low: template }, material,
    ground: { revision: 1, revisionAt: () => 1, forTile: () => SLICE }, ...options });
  return { layer, dispose() { layer.dispose(); material.dispose(); template.dispose(); } };
}

const bladeBands = {
  reach: 32,
  selectBand: nearest => nearest < 12 ** 2 ? 'high' : nearest < 24 ** 2 ? 'low' : null,
  selectPreparationBand: nearest => {
    const led = Math.max(0, Math.sqrt(nearest) - 8) ** 2;
    return led < 12 ** 2 ? 'high' : led < 24 ** 2 ? 'low' : null;
  },
};
const cardBands = {
  reach: 40,
  selectBand: (nearest, farthest) => nearest < 40 ** 2 && farthest > 20 ** 2 ? 'high' : null,
};

for (const [name, bands] of [['blades', bladeBands], ['cards', cardBands]]) {
  test(`small camera steps keep the same ${name} window as a full walk`, () => {
    const moving = layerWith(bands);
    try {
      let x = 3, z = -5;
      for (let step = 0; step < 900; step += 1) {
        x += Math.cos(step / 37) * 0.4;
        z += Math.sin(step / 53) * 0.4;
        // The layer re-evaluates on the quarter-metre grid, so walk on it.
        const camera = { x: Math.round(x * 4) / 4, z: Math.round(z * 4) / 4 };
        moving.layer.update(camera, { x: 0, z: 0 }, Infinity, 1);
        if (step % 7) continue;
        const reference = layerWith(bands);
        reference.layer.update(camera, { x: 0, z: 0 }, 0, 1, null, false);
        const describe = layer => [...layer.tiles.keys()].sort()
          .map(key => `${key}=${layer.tiles.get(key).band}/${layer.tiles.get(key).preparationBand}`);
        assert.deepEqual(describe(moving.layer), describe(reference.layer), `step ${step}`);
        reference.dispose();
      }
    } finally { moving.dispose(); }
  });
}

test('a step inside the slack visits only the boundary cells', () => {
  const { layer, dispose } = layerWith(bladeBands);
  try {
    layer.update({ x: 0, z: 0 }, { x: 0, z: 0 }, Infinity, 1);
    let visited = 0;
    const refreshCell = layer.refreshCell;
    layer.refreshCell = function (...args) { visited += 1; return refreshCell.apply(this, args); };
    layer.update({ x: 0.25, z: 0 }, { x: 0, z: 0 }, Infinity, 1);
    assert.ok(visited > 0 && visited < layer.tiles.size * 0.75, `visited ${visited} of ${layer.tiles.size}`);
  } finally { dispose(); }
});
