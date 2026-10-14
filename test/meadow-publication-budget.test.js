import assert from 'node:assert/strict';
import test from 'node:test';
import { MeshBasicNodeMaterial, Scene } from 'three/webgpu';

import { MeadowTileLayer } from '../src/editor/stylized/meadow/MeadowTileLayer.js';
import { createMeadowTemplate } from '../src/editor/stylized/meadow/meadowGrassGeometry.js';

test('prepared LOD changes spread source uploads across frames and retain the previous grass', () => {
  const templates = {
    high: createMeadowTemplate({ detail: 3, count: 256, tileSize: 8 }),
    low: createMeadowTemplate({ detail: 2, count: 64, tileSize: 8 }),
  };
  const material = new MeshBasicNodeMaterial();
  const maxPublicationBytes = 256 * 14 * 4;
  const ground = { revision: 1, revisionAt: () => ground.revision,
    forTile: () => ({ revision: ground.revision, sample(x, z, rank, out) {
      Object.assign(out, { height: ground.revision - 1, strength: 1, shape: 0, path: 0 });
      return true;
    } }) };
  const layer = new MeadowTileLayer({ scene: new Scene(), name: 'publication', templates, material,
    tileSize: 8, reach: 24, ground, maxPublicationBytes,
    selectBand: nearest => nearest < 10 ** 2 ? 'high' : nearest < 24 ** 2 ? 'low' : null,
    selectPreparationBand: () => 'high' });
  const update = x => layer.update({ x, z: 0 }, { x: 0, z: 0 }, Infinity, 10);
  try {
    for (let i = 0; i < 100; i++) update(0);
    assert.equal(layer.getState().building, 0);
    const before = new Map([...layer.tiles.values()].map(tile => [tile, { buildId: tile.buildId, output: tile.output }]));
    layer.beginFrame(1);
    const scheduledUpdate = build => layer.update({ x: 8, z: 0 }, { x: 0, z: 0 }, Infinity, 10, null, build, 1);
    scheduledUpdate(false);
    assert.equal(layer.publicationBytes, 0, 'the layout-only pass leaves publication to scheduled work');
    scheduledUpdate(true);
    scheduledUpdate(false);
    scheduledUpdate(true);
    scheduledUpdate(true);
    const changed = [...layer.tiles.values()].filter(tile => tile.output && before.get(tile)?.buildId !== tile.buildId);
    const bytes = changed.reduce((sum, tile) => sum + tile.output.count * 14 * 4, 0);
    assert.ok(bytes > 0 && bytes <= maxPublicationBytes, `one frame published ${bytes} source bytes`);
    const waiting = [...layer.tiles.values()].filter(tile => tile.band !== null && tile.builtBand !== tile.band);
    assert.ok(waiting.length > 0, 'ready transitions wait their turn');
    for (const tile of waiting) {
      if (before.get(tile)?.output) assert.equal(tile.output, before.get(tile).output, 'previous grass stays published');
    }
    for (let i = 0; i < 100; i++) update(8);
    assert.equal(layer.getState().building, 0);
    assert.equal(layer.getState().visibleMissing, 0);
    assert.equal(layer.getState().visibleCapacityLag, 0);
    // A completed ground rebuild that cannot publish yet must retain ownership
    // of the old buffer. Pool reuse must not overwrite still-visible grass.
    const old = new Map([...layer.tiles.values()].map(tile => [tile, tile.output]));
    ground.revision++;
    layer.maxPublicationBytes = 1; // Even a tile larger than the cap must progress.
    update(8);
    const refreshed = [...layer.tiles.values()].filter(tile => tile.output && tile.builtRevision === 2);
    assert.equal(refreshed.length, 1);
    for (const tile of layer.tiles.values()) {
      if (tile.output && tile.builtRevision !== 2) {
        assert.equal(tile.output, old.get(tile));
        for (let i = 0; i < tile.output.count; i++) assert.equal(tile.output.position[i * 4 + 1], 0);
      }
    }
    for (let i = 0; i < 100; i++) update(8);
    assert.equal(layer.getState().building, 0);
    for (const tile of layer.tiles.values()) {
      if (tile.band !== null) assert.equal(tile.builtRevision, 2);
    }
  } finally {
    layer.dispose(); material.dispose();
  }
});
