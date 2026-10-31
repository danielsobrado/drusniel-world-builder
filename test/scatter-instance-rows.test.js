import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three/webgpu';
import { drawnRepresentations, ScatterInstanceRows } from '../src/editor/stylized/lod/ScatterInstanceRows.js';

const CAPACITY = 16;

function createMesh() {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('instanceDither', new THREE.InstancedBufferAttribute(new Float32Array(CAPACITY * 3), 3));
  return {
    geometry,
    instanceMatrix: new THREE.InstancedBufferAttribute(new Float32Array(CAPACITY * 16), 16),
    count: 0,
    computeBoundingSphere() { this.boundingSphere = new THREE.Sphere(); },
  };
}

function fixture() {
  let matrices = 0;
  const rows = new ScatterInstanceRows('test', (placement) => {
    matrices += 1;
    return new THREE.Matrix4().makeTranslation(placement.x, 0, 0);
  }, placement => ({ seed: placement.x / 100, colorVariation: 1 }));
  const near = [[createMesh()]], proxy = [[createMesh()]];
  const anchor = { x: 0, z: 0 };
  const publish = (chunks, retained = rows) => {
    const job = retained.begin();
    for (const [key, manifest, representations] of chunks) drain(retained.stageChunk(job, key, manifest, representations));
    drain(retained.stageRetired(job));
    return retained.commit(job, near, proxy, anchor);
  };
  return { rows, near: near[0][0], proxy: proxy[0][0], anchor, publish, matrices: () => matrices };
}

function drain(iterator) { while (!iterator.next().done); }
const NEAR = [{ band: 'near', fade: 1, ditherDirection: 1 }];
const PROXY = [{ band: 'proxy', fade: 1, ditherDirection: 1 }];
const manifest = (...xs) => xs.map(x => ({ x, prototypeIndex: 0 }));
const matrixX = (mesh, row) => mesh.instanceMatrix.array[row * 16 + 12];
const drawnX = mesh => Array.from({ length: mesh.count }, (_, row) => matrixX(mesh, row)).sort((a, b) => a - b);

test('an unchanged chunk keeps its rows, matrices and buffers across a rebuild', () => {
  const { near, publish, matrices } = fixture();
  const chunk = manifest(1, 2, 3);
  assert.equal(publish([['0:0', chunk, NEAR]]).near, 3);
  near.instanceMatrix.clearUpdateRanges();
  const version = near.instanceMatrix.version;
  const result = publish([['0:0', chunk, NEAR]]);
  assert.equal(result.manifestsChanged, false);
  assert.equal(result.near, 3);
  assert.equal(matrices(), 3);
  assert.equal(near.instanceMatrix.version, version);
  assert.equal(near.instanceMatrix.updateRanges.length, 0);
});

test('a window step writes only the rows of the chunks that moved', () => {
  const { near, publish, matrices } = fixture();
  const kept = manifest(1, 2, 3), left = manifest(4, 5), arrived = manifest(6);
  publish([['0:0', left, NEAR], ['0:1', kept, NEAR]]);
  near.instanceMatrix.clearUpdateRanges();
  const result = publish([['0:1', kept, NEAR], ['0:2', arrived, NEAR]]);
  assert.equal(result.manifestsChanged, true);
  assert.deepEqual(drawnX(near), [1, 2, 3, 6]);
  assert.equal(matrices(), 6, 'kept placements reuse their matrices');
  const [{ start, count }] = near.instanceMatrix.updateRanges;
  assert.ok(count < 4 * 16, `uploaded ${count / 16} rows from ${start / 16}`);
});

test('a chunk changing band moves to the other renderer, and a cross-fade draws both', () => {
  const { near, proxy, publish } = fixture();
  const chunk = manifest(1, 2);
  publish([['0:0', chunk, NEAR]]);
  publish([['0:0', chunk, [{ band: 'near', fade: 0.5, ditherDirection: 1 }, { band: 'proxy', fade: 0.5, ditherDirection: -1 }]]]);
  assert.deepEqual([near.count, proxy.count], [2, 2]);
  publish([['0:0', chunk, PROXY]]);
  assert.deepEqual([near.count, proxy.count], [0, 2]);
  assert.deepEqual(drawnX(proxy), [1, 2]);
});

test('two representations on one renderer stay two rows', () => {
  const { proxy, publish } = fixture();
  publish([['0:0', manifest(1), [{ band: 'proxy', fade: 0.25, ditherDirection: -1 }, { band: 'proxy', fade: 0.75, ditherDirection: 1 }]]]);
  assert.equal(proxy.count, 2);
});

test('an abandoned rebuild publishes nothing and the next one starts from the last publication', () => {
  const { rows, near, publish } = fixture();
  const chunk = manifest(1, 2);
  publish([['0:0', chunk, NEAR]]);
  const job = rows.begin();
  drain(rows.stageChunk(job, '0:1', manifest(7), NEAR));
  drain(rows.stageRetired(job));
  assert.deepEqual(drawnX(near), [1, 2]);
  assert.equal(publish([['0:0', chunk, NEAR]]).manifestsChanged, false);
  assert.deepEqual(drawnX(near), [1, 2]);
});

test('moving the anchor rewrites every row relative to it', () => {
  const { near, anchor, publish } = fixture();
  const chunk = manifest(10, 20);
  publish([['0:0', chunk, NEAR]]);
  anchor.x = 4;
  publish([['0:0', chunk, NEAR]]);
  assert.deepEqual(drawnX(near), [6, 16]);
});

test('drawn representations drop culled and faded bands and fold the rest onto proxy', () => {
  assert.deepEqual(drawnRepresentations({ representations: [
    { band: 'culled', fade: 1, ditherDirection: -1 },
    { band: 'near', fade: 0, ditherDirection: 1 },
    { band: 'impostor', fade: 0.5 },
  ] }), [{ band: 'proxy', fade: 0.5, ditherDirection: 1 }]);
  assert.deepEqual(drawnRepresentations(undefined), []);
});
