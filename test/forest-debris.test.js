import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createArchedRootBridgeGeometry,
  createFallenBranchGeometry,
  createFallenLogGeometry,
  createFungiClusterGeometry,
  createHollowNurseTrunkGeometry,
  createLeafLitterGeometry,
  createMossMoundGeometry,
  createRootWadGeometry,
  createShelfFungusLogGeometry,
  createSnappedSnagGeometry,
  createSplitTimberLogGeometry,
  createStumpGeometry,
} from '../src/editor/stylized/forest/forestDebrisGeometry.js';
import { createForestDebrisPrototypes } from '../src/editor/stylized/forest/forestDebrisPrototypes.js';

const SHAPES = {
  createStumpGeometry,
  createFallenLogGeometry,
  createFallenBranchGeometry,
  createLeafLitterGeometry,
  createMossMoundGeometry,
  createFungiClusterGeometry,
  createSnappedSnagGeometry,
  createRootWadGeometry,
  createHollowNurseTrunkGeometry,
  createArchedRootBridgeGeometry,
  createSplitTimberLogGeometry,
  createShelfFungusLogGeometry,
};

for (const [name, create] of Object.entries(SHAPES)) {
  test(`${name} is finite, coloured and within its budget`, () => {
    const geometry = create();
    const position = geometry.getAttribute('position');
    const uv = geometry.getAttribute('uv');
    assert.ok(position.array.every(Number.isFinite));
    assert.ok(uv && uv.count === position.count && uv.array.every(Number.isFinite));
    assert.equal(geometry.getAttribute('color').count, position.count);
    assert.ok(geometry.getIndex().array.every((index) => index < position.count));
    assert.ok(geometry.getIndex().count / 3 <= 1400, `${geometry.getIndex().count / 3} triangles`);
  });
}

for (const variant of ['jagged', 'hollow', 'weathered']) {
  test(`createStumpGeometry variant "${variant}" has outward top normals and distinct silhouette`, () => {
    const stump = createStumpGeometry({ variant });
    const pos = stump.getAttribute('position');
    const nrm = stump.getAttribute('normal');
    assert.ok(pos.array.every(Number.isFinite));
    assert.ok(stump.getIndex().count / 3 <= 1400);
    let maxY = -Infinity;
    for (let i = 0; i < pos.count; i += 1) maxY = Math.max(maxY, pos.getY(i));
    let topNormalSum = 0;
    for (let i = 0; i < pos.count; i += 1) {
      if (pos.getY(i) > maxY - 0.06) topNormalSum += nrm.getY(i);
    }
    assert.ok(topNormalSum > 0, `stump "${variant}" top normal sum ${topNormalSum} should point +Y`);
  });
}

for (const variant of ['split', 'uprooted', 'nurse']) {
  test(`createFallenLogGeometry variant "${variant}" is finite, bounded, and has outward end normals`, () => {
    const log = createFallenLogGeometry({ variant });
    const pos = log.getAttribute('position');
    const nrm = log.getAttribute('normal');
    assert.ok(pos.array.every(Number.isFinite));
    assert.ok(log.getIndex().count / 3 <= 1400);
    let minX = Infinity;
    let maxX = -Infinity;
    for (let i = 0; i < pos.count; i += 1) {
      minX = Math.min(minX, pos.getX(i));
      maxX = Math.max(maxX, pos.getX(i));
    }
    let footNx = 0;
    let tipNx = 0;
    for (let i = 0; i < pos.count; i += 1) {
      if (pos.getX(i) < minX + 0.08) footNx += nrm.getX(i);
      if (pos.getX(i) > maxX - 0.08) tipNx += nrm.getX(i);
    }
    assert.ok(footNx < -0.2, `fallenLog "${variant}" foot normal X ${footNx} should face -X outward`);
    assert.ok(tipNx > 0.2, `fallenLog "${variant}" tip normal X ${tipNx} should face +X outward`);
  });
}

test('stump and fallen log end caps face outward rather than culling inward', () => {
  const stump = createStumpGeometry();
  const sPos = stump.getAttribute('position');
  const sNrm = stump.getAttribute('normal');
  let maxY = -Infinity;
  let topNormalSum = 0;
  for (let i = 0; i < sPos.count; i += 1) maxY = Math.max(maxY, sPos.getY(i));
  for (let i = 0; i < sPos.count; i += 1) {
    if (sPos.getY(i) > maxY - 0.04) topNormalSum += sNrm.getY(i);
  }
  assert.ok(topNormalSum > 0, `stump top cap normal sum ${topNormalSum} should point +Y`);

  const log = createFallenLogGeometry();
  const lPos = log.getAttribute('position');
  const lNrm = log.getAttribute('normal');
  let minX = Infinity;
  let maxX = -Infinity;
  for (let i = 0; i < lPos.count; i += 1) {
    minX = Math.min(minX, lPos.getX(i));
    maxX = Math.max(maxX, lPos.getX(i));
  }
  let footNx = 0;
  let tipNx = 0;
  for (let i = 0; i < lPos.count; i += 1) {
    if (lPos.getX(i) < minX + 0.04) footNx += lNrm.getX(i);
    if (lPos.getX(i) > maxX - 0.04) tipNx += lNrm.getX(i);
  }
  assert.ok(footNx < -0.5, `fallenLog foot cap normal X ${footNx} should face -X outward`);
  assert.ok(tipNx > 0.5, `fallenLog tip cap normal X ${tipNx} should face +X outward`);
});

test('fallen leaves face the sky, so a two-sided material lights them from above', () => {
  const geometry = createLeafLitterGeometry();
  const position = geometry.getAttribute('position');
  const index = geometry.getIndex();
  for (let triangle = 0; triangle < index.count; triangle += 3) {
    const [a, b, c] = [index.getX(triangle), index.getX(triangle + 1), index.getX(triangle + 2)];
    const ux = position.getX(b) - position.getX(a);
    const uz = position.getZ(b) - position.getZ(a);
    const vx = position.getX(c) - position.getX(a);
    const vz = position.getZ(c) - position.getZ(a);
    assert.ok(uz * vx - ux * vz > 0, `triangle ${triangle / 3} faces down`);
  }
});

test('a debris variant keeps its biomes, conform flag, and scanned bark hook', () => {
  const definitions = createForestDebrisPrototypes({
    variants: {
      leafLitter: { weight: 6, tileIds: [6] },
      fallenLogBroadleaf: { kind: 'fallenLog', barkProfile: 'beech', weight: 0.2, tileIds: [6], minCanopy: 0.22 },
      unicorn: {},
      stump: { enabled: false },
    },
  });
  assert.deepEqual(definitions.map(({ id }) => id), ['leafLitter', 'fallenLogBroadleaf']);
  assert.deepEqual(definitions[0].tileIds, [6]);
  assert.equal(definitions[0].weight, 6);
  assert.equal(definitions[1].conform, true);
  assert.equal(definitions[1].barkProfile, 'beech');
  assert.equal(definitions[1].minCanopy, 0.22);
  assert.equal(definitions[1].parts[0].instanceBiomeLook, true);
  const fakeScan = { albedoHeight: {}, normalRoughness: {} };
  assert.equal(definitions[1].syncScannedBark(new Map([['beech', fakeScan]])), true);
  for (const def of definitions) {
    for (const part of def.parts) {
      part.geometry.dispose();
      part.material.dispose();
    }
  }
});
