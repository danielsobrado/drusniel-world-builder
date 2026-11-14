import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three/webgpu';
import {
  BRIDGE_CELL_METERS,
  MAX_WATER_SPAN_METERS,
  bridgeDeckHeightAt,
  bridgesInCell,
  createBridgeTerrainSampler,
} from '../src/editor/stylized/path/pathBridgeField.js';
import { buildPathBridgesGeometry } from '../src/editor/stylized/path/pathBridgeGeometry.js';
import { PathBridgeView } from '../src/editor/stylized/path/PathBridgeView.js';
import {
  naturalTrailFieldAt,
  naturalTrailGradientAt,
  normalizeNaturalTrailConfig,
} from '../src/editor/stylized/naturalTrailMath.js';
import { WATER_BODY_ID_BOG, WATER_KIND_LAKE, WATER_KIND_RIVER } from '../src/editor/water/WaterConstants.js';

function findNaturalTrailCrossingPoint(settings) {
  for (let z = 10; z <= 220; z += 4) {
    for (let x = 10; x <= 220; x += 1) {
      const a = naturalTrailFieldAt(x, z, settings) - settings.level;
      const b = naturalTrailFieldAt(x + 1, z, settings) - settings.level;
      if ((a <= 0 && b >= 0) || (a >= 0 && b <= 0)) {
        const px = x + 0.5;
        const g = naturalTrailGradientAt(px, z, settings);
        const glen = Math.hypot(g.x, g.z);
        if (glen > 0.005) {
          return { x: px, z, tanX: -g.z / glen, tanZ: g.x / glen };
        }
      }
    }
  }
  throw new Error('Could not find a naturalTrail contour point in test window');
}

function makeRiverStripSampler(centerX, centerZ, axisX, axisZ, riverHalfWidth, { surfaceHeight = 10, bankHeight = 10.35 } = {}) {
  return {
    tileSize: 2,
    sampleHeight(x, z) {
      const dist = Math.abs((x - centerX) * axisX + (z - centerZ) * axisZ);
      if (dist <= riverHalfWidth) {
        const t = dist / riverHalfWidth;
        return 7.5 + (surfaceHeight - 7.5) * (t * t);
      }
      return bankHeight;
    },
    sampleWater(x, z) {
      const dist = Math.abs((x - centerX) * axisX + (z - centerZ) * axisZ);
      if (dist > riverHalfWidth) return null;
      return {
        kind: WATER_KIND_RIVER,
        bodyId: 1025,
        coverage: 1,
        surfaceHeight,
        bedHeight: 7.5,
      };
    },
  };
}

test('bridgesInCell detects a naturalTrail crossing over a river and keeps deck dry', () => {
  const settings = normalizeNaturalTrailConfig({ enabled: true });
  const seed = findNaturalTrailCrossingPoint(settings);
  const sampler = makeRiverStripSampler(seed.x, seed.z, seed.tanX, seed.tanZ, 4.2);

  const ownerX = Math.floor(seed.x / BRIDGE_CELL_METERS);
  const ownerZ = Math.floor(seed.z / BRIDGE_CELL_METERS);
  const bridges = bridgesInCell(ownerX, ownerZ, sampler, { naturalTrail: settings });
  assert.ok(bridges.length >= 1, 'Expected at least one bridge across the river');

  const bridge = bridges[0];
  assert.equal(bridge.kind, 'trail');
  assert.ok(bridge.span >= 7 && bridge.span <= 14, `Unexpected span ${bridge.span}`);
  const midY = bridgeDeckHeightAt(bridge, bridge.midX, bridge.midZ);
  assert.ok(midY !== null && midY > sampler.sampleWater(seed.x, seed.z).surfaceHeight + 0.25);

  // Adjacent cell must NOT emit a duplicate owned by (ownerX, ownerZ).
  const neighborBridges = bridgesInCell(ownerX + 1, ownerZ, sampler, { naturalTrail: settings });
  for (const nb of neighborBridges) {
    assert.notEqual(Math.floor(nb.midX / BRIDGE_CELL_METERS), ownerX);
  }
});

test('bridgesInCell creates intermediate piers for wide rivers and rejects ocean-scale spans', () => {
  const settings = normalizeNaturalTrailConfig({ enabled: true });
  const seed = findNaturalTrailCrossingPoint(settings);

  const wideRiver = makeRiverStripSampler(seed.x, seed.z, seed.tanX, seed.tanZ, 8.0);
  const cellX = Math.floor(seed.x / BRIDGE_CELL_METERS);
  const cellZ = Math.floor(seed.z / BRIDGE_CELL_METERS);
  const wideBridges = bridgesInCell(cellX, cellZ, wideRiver, { naturalTrail: settings });
  assert.ok(wideBridges.length >= 1);
  assert.ok(wideBridges[0].piers.length >= 1, 'Wide bridge should add support pilings');

  const ocean = makeRiverStripSampler(seed.x, seed.z, seed.tanX, seed.tanZ, MAX_WATER_SPAN_METERS);
  const oceanBridges = bridgesInCell(cellX, cellZ, ocean, { naturalTrail: settings });
  assert.equal(oceanBridges.length, 0, 'Open sea/wide lake crossings must not generate bridges');
});

test('bridgesInCell bridges TrailGrading routes over channels without duplicating at cell borders', () => {
  const tileSize = 2;
  const route = { length: 60, halfWidth: 1.9 };
  // Route runs along z = 14 from x = 0 to x = 60 in world coords -> cell coords (x/2, -z/2)
  const trails = {
    nearbyRoutesInBounds() {
      return [route];
    },
    pointAt(_route, along) {
      return { x: along / tileSize, z: -14 / tileSize };
    },
  };
  const sampler = makeRiverStripSampler(16, 14, 1, 0, 5.0);

  const bridges = bridgesInCell(0, 0, sampler, { trails });
  assert.equal(bridges.length, 1);
  assert.equal(bridges[0].kind, 'road');
  assert.ok(Math.abs(bridges[0].midX - 16) < 0.6);
  assert.ok(Math.abs(bridges[0].midZ - 14) < 0.2);
  assert.ok(bridges[0].piers.length >= 1);

  // Cell (1, 0) also overlaps search margin, but midpoint is in (0, 0), so (1, 0) yields none.
  assert.equal(bridgesInCell(1, 0, sampler, { trails }).length, 0);
});

test('createBridgeTerrainSampler detects bog pool water via generator fallback', () => {
  const sampler = createBridgeTerrainSampler({
    getCanonicalHeight: () => 5.0,
    worldStore: {
      generator: {
        tileSize: 2,
        sampleWater(cx, cz) {
          if (Math.hypot(cx - 5, cz + 6) < 3) {
            return {
              kind: WATER_KIND_LAKE,
              bodyId: WATER_BODY_ID_BOG,
              coverage: 1,
              surfaceHeight: 5.1,
              bedHeight: 4.2,
            };
          }
          return null;
        },
      },
    },
  });

  const wet = sampler.sampleWater(10, 12);
  assert.ok(wet && wet.bodyId === WATER_BODY_ID_BOG);
  assert.equal(sampler.sampleWater(100, 100), null);
});

test('PathBridgeView streams single-batch geometry and exposes walkable deckHeightAt', () => {
  const scene = new THREE.Scene();
  const origin = { x: 4, z: 2 };
  const route = { length: 40, halfWidth: 1.8 };
  const sampler = makeRiverStripSampler(16, 16, 1, 0, 4.5, { surfaceHeight: 12.0, bankHeight: 12.4 });
  const terrainView = {
    floatingOrigin: { getState: () => origin },
    worldStore: {
      generator: {
        tileSize: 2,
        ensureTrailGrading: () => ({
          nearbyRoutesInBounds: () => [route],
          pointAt: (_r, s) => ({ x: s / 2, z: -16 / 2 }),
        }),
      },
    },
  };

  const view = new PathBridgeView({
    scene,
    terrainView,
    sampler,
    reachCells: 1,
    cellsPerFrame: 12,
  });

  // Walkable height works synchronously right on deck centerline and returns null off-deck.
  const deckY = view.deckHeightAt(16, 16);
  assert.ok(deckY !== null && deckY > 12.25);
  assert.equal(view.deckHeightAt(16, 22), null);

  // Stepping residency builds the batched mesh inside the scene.
  view.update({ x: 16, z: 16 });
  assert.ok(view.mesh && view.mesh.isMesh);
  assert.ok(scene.children.includes(view.root));
  const pos = view.mesh.geometry.getAttribute('position');
  const norm = view.mesh.geometry.getAttribute('normal');
  const col = view.mesh.geometry.getAttribute('color');
  assert.ok(pos.count > 100);
  for (let i = 0; i < pos.count; i += 1) {
    assert.ok(Number.isFinite(pos.getX(i)) && Number.isFinite(pos.getY(i)) && Number.isFinite(pos.getZ(i)));
    const nLen = Math.hypot(norm.getX(i), norm.getY(i), norm.getZ(i));
    assert.ok(Math.abs(nLen - 1) < 1e-3);
    assert.ok(col.getX(i) >= 0 && col.getX(i) <= 1);
  }

  // Empty build returns null cleanly.
  assert.equal(buildPathBridgesGeometry([]), null);

  view.dispose();
  assert.equal(view.mesh, null);
  assert.ok(!scene.children.includes(view.root));
});
