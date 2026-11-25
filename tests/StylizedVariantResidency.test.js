import assert from 'node:assert/strict';
import test from 'node:test';
import {
  requiredVariantKeys,
  StylizedVariantResidency,
  variantKey,
} from '../src/editor/stylized/StylizedVariantResidency.js';

const DEFINITIONS = [
  { scene: '/assets/rocks/generic.glb' },
  { id: 'desert-rock', scene: '/assets/rocks/desert.glb', tileIds: [1, 2] },
  { id: 'tundra-rock', scene: '/assets/rocks/tundra.glb', tileIds: [11] },
];

/**
 * A terrain whose tiles are decided by chunk column, so a scan window's contents
 * follow directly from where the focus chunk is.
 */
function createTerrainView({ chunkSize = 16, tileForChunkX = () => 1 } = {}) {
  return {
    focusChunkKey: '0:0',
    focusChunk: { chunkX: 0, chunkZ: 0 },
    worldStore: { chunkSize },
    tileMap: {
      get: (cellX) => tileForChunkX(Math.floor(cellX / chunkSize)),
    },
  };
}

function createLayer({ id = 'rocks', definitions = DEFINITIONS, residentRadius = 2 } = {}) {
  const applied = [];
  const acquired = [];
  return {
    applied,
    acquired,
    layer: {
      id,
      paletteLayerId: id,
      definitions,
      residentRadius,
      acquire: async (scene) => {
        acquired.push(scene);
        return { scene };
      },
      apply: (variants) => applied.push(...variants.map(({ definition }) => variantKey(definition))),
    },
  };
}

test('variant keys prefer the authored id over the scene path', () => {
  assert.equal(variantKey({ scene: '/a.glb' }), '/a.glb');
  assert.equal(variantKey({ id: 'oak', scene: '/a.glb' }), 'oak');
});

test('variants without tileIds are required everywhere', () => {
  const required = requiredVariantKeys({ definitions: DEFINITIONS, tileIds: new Set([7]) });
  assert.deepEqual([...required], ['/assets/rocks/generic.glb']);
});

test('a variant is required once one of its biomes is in range', () => {
  const required = requiredVariantKeys({ definitions: DEFINITIONS, tileIds: new Set([2, 7]) });
  assert.ok(required.has('desert-rock'));
  assert.ok(!required.has('tundra-rock'));
});

test('a palette pin requires the variant even outside its authored biomes', () => {
  const required = requiredVariantKeys({
    definitions: DEFINITIONS,
    tileIds: new Set([7]),
    pinnedKeys: new Set(['tundra-rock']),
  });
  assert.ok(required.has('tundra-rock'));
});

test('only the variants near the focus are queued', async () => {
  // Desert (tile 2) occupies chunk column 3 onwards; tundra (11) starts at 40.
  const terrainView = createTerrainView({
    tileForChunkX: (chunkX) => {
      if (chunkX >= 40) return 11;
      if (chunkX >= 3) return 2;
      return 7;
    },
  });
  const { layer, applied } = createLayer();
  const residency = new StylizedVariantResidency({
    terrainView,
    layers: [layer],
    prefetchChunks: 2,
    rescanIntervalMs: 0,
  });

  residency.update(0);
  await Promise.resolve();
  await Promise.resolve();
  // One install per frame, so two frames to drain both.
  residency.update(1);
  residency.update(2);
  // The generic rock is always required; the desert rock is three chunks away,
  // inside the radius-4 prefetch window.
  assert.deepEqual(applied.sort(), ['/assets/rocks/generic.glb', 'desert-rock']);
  assert.ok(!applied.includes('tundra-rock'));
});

test('approaching a new biome pulls its variant in', async () => {
  const terrainView = createTerrainView({
    tileForChunkX: (chunkX) => (chunkX >= 40 ? 11 : 7),
  });
  const { layer, applied } = createLayer();
  const residency = new StylizedVariantResidency({
    terrainView,
    layers: [layer],
    prefetchChunks: 2,
    rescanIntervalMs: 0,
  });

  residency.update(0);
  await Promise.resolve();
  residency.update(1);
  assert.ok(!applied.includes('tundra-rock'));

  terrainView.focusChunk = { chunkX: 38, chunkZ: 0 };
  terrainView.focusChunkKey = '38:0';
  residency.update(2);
  await Promise.resolve();
  residency.update(3);
  assert.ok(applied.includes('tundra-rock'));
});

test('prioritized residency abandons a biome request and promotes the new nearby demand', async () => {
  const terrainView = createTerrainView({ tileForChunkX: (x) => x >= 30 ? 11 : x >= 3 ? 2 : 7 });
  const { layer } = createLayer({ definitions: DEFINITIONS.slice(1) });
  const events = [];
  layer.acquireLease = (scene, priority) => {
    events.push([scene, priority]);
    let cancel;
    const ready = new Promise((_, reject) => { cancel = reject; });
    return {
      ready,
      promote: (next) => events.push([scene, next]),
      release: () => { events.push([scene, 'release']); cancel(new Error('cancelled')); },
    };
  };
  const residency = new StylizedVariantResidency({ terrainView, layers: [layer], manageRequests: true });
  try {
    residency.update(0);
    terrainView.focusChunk = { chunkX: 3, chunkZ: 0 };
    residency.update(1);
    terrainView.focusChunk = { chunkX: 40, chunkZ: 0 };
    residency.update(2);
    await Promise.resolve();
    assert.deepEqual(events, [
      ['/assets/rocks/desert.glb', 'low'],
      ['/assets/rocks/desert.glb', 'high'],
      ['/assets/rocks/desert.glb', 'release'],
      ['/assets/rocks/tundra.glb', 'high'],
    ]);
    assert.deepEqual(residency.getPreparationStatus().errors, []);
  } finally {
    residency.dispose();
  }
});

test('installs are capped per frame so an arriving batch cannot hitch', async () => {
  const terrainView = createTerrainView({ tileForChunkX: () => 2 });
  const { layer, applied } = createLayer();
  const residency = new StylizedVariantResidency({
    terrainView,
    layers: [layer],
    prefetchChunks: 2,
    appliesPerFrame: 1,
    rescanIntervalMs: 0,
  });

  residency.update(0);
  await Promise.resolve();
  await Promise.resolve();
  residency.update(1);
  assert.equal(applied.length, 1);
  residency.update(2);
  assert.equal(applied.length, 2);
});

test('an install still advances a step each frame when the shared budget is spent', async () => {
  const terrainView = createTerrainView({ tileForChunkX: () => 7 });
  const { layer } = createLayer({ definitions: [{ scene: '/assets/rocks/generic.glb' }] });
  let steps = 0;
  layer.apply = function* () { for (let unit = 0; unit < 3; unit += 1) { steps += 1; yield; } return []; };
  const residency = new StylizedVariantResidency({ terrainView, layers: [layer], rescanIntervalMs: 0 });
  const exhausted = () => true;

  residency.update(0, exhausted);
  await Promise.resolve();
  await Promise.resolve();
  for (let frame = 1; frame <= 4; frame += 1) residency.update(frame, exhausted);
  assert.equal(steps, 3);
  assert.equal(residency.getPreparationStatus().pending, 0);
});

test('a variant is requested once, and a failed one is not retried', async () => {
  const terrainView = createTerrainView({ tileForChunkX: () => 7 });
  const { layer, acquired } = createLayer({ definitions: [DEFINITIONS[0]] });
  layer.acquire = async (scene) => {
    acquired.push(scene);
    throw new Error('missing');
  };
  const residency = new StylizedVariantResidency({
    terrainView,
    layers: [layer],
    rescanIntervalMs: 0,
  });

  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => warnings.push(args);
  try {
    residency.update(0);
    await Promise.resolve();
    await Promise.resolve();
    residency.update(1);
    await Promise.resolve();
    residency.update(2);
  } finally {
    console.warn = originalWarn;
  }
  assert.equal(acquired.length, 1);
  assert.equal(warnings.length, 1);
});
