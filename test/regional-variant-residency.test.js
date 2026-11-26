import assert from 'node:assert/strict';
import test from 'node:test';
import { StylizedVariantResidency } from '../src/editor/stylized/StylizedVariantResidency.js';

test('layer-local windows avoid remote variants and detect rare resident tiles', () => {
  const layer = (id, residentRadius, eligibleTileIds) => ({
    id, residentRadius, eligibleTileIds,
    definitions: [{ id: 'generic' }, { id: 'rare', tileIds: [7] }, { id: 'remote', tileIds: [9] }],
  });
  const close = layer('close', 1, [7, 9]), far = layer('far', 3, [7, 9]), aquatic = layer('aquatic', 1, [0]);
  const terrainView = {
    focusChunk: { chunkX: 0, chunkZ: 0 },
    worldStore: { chunkSize: 4 },
    tileMap: { get: x => x >= 12 ? 9 : 3 },
    slots: [{ descriptor: { chunkX: 0, chunkZ: 0 }, pageRevision: 1,
      page: { tiles: Uint8Array.from([3, 3, 7, 3]) } }],
  };
  const residency = new StylizedVariantResidency({
    terrainView, prefetchChunks: 0, samplesPerChunkAxis: 1, layers: [close, far, aquatic],
  });
  residency.rescan();
  assert.deepEqual([...close.requiredKeys].sort(), ['generic', 'rare']);
  assert.deepEqual([...far.requiredKeys].sort(), ['generic', 'rare', 'remote']);
  assert.equal(aquatic.requiredKeys.size, 0);
});
