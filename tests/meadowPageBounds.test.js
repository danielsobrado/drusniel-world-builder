import assert from 'node:assert/strict';
import test from 'node:test';
import { Frustum, Matrix4, MeshBasicNodeMaterial, PerspectiveCamera, Scene, Vector3 } from 'three/webgpu';
import { MeadowBandBatch } from '../src/editor/stylized/meadow/MeadowBandBatch.js';
import { meadowBladeBoundsPadding, meadowCardBoundsPadding } from '../src/editor/stylized/meadow/MeadowPageBounds.js';
import { createCompaction } from '../src/editor/stylized/meadow/meadowGrassCompaction.js';
import { compactionPrefix } from '../src/editor/stylized/meadow/MeadowCompactionPrefix.js';
import { createMeadowTemplate } from '../src/editor/stylized/meadow/meadowGrassGeometry.js';

const node = value => ({ value });

function frustum(camera) {
  camera.updateMatrixWorld();
  return new Frustum().setFromProjectionMatrix(new Matrix4()
    .multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse), camera.coordinateSystem);
}

test('dense page bounds preserve shader envelopes across views, tuning and an origin shift', t => {
  const template = createMeadowTemplate({ detail: 3, count: 16, tileSize: 8 });
  const material = new MeshBasicNodeMaterial();
  const uniforms = { bladeHeight: node(0.54), bladeWidth: node(0.071), heightScale: node({ x: 0.88, y: 1.22 }),
    widthScale: node(1.05), taper: node(0.62), curve: node(0.045), baseBend: node(0.1),
    appearance: { lodWidenMax: node(2), lodThinning: node(1) } };
  const tuning = { widthScale: node(1), flutterStrength: node(0.03) };
  const padding = meadowBladeBoundsPadding(uniforms, tuning, 0.75);
  const page = new MeadowBandBatch({ scene: new Scene(), template, material, name: 'bounds', boundsPadding: padding });
  t.after(() => { page.dispose(); template.dispose(); material.dispose(); });
  const tile = { buildId: 1, renderX: 0, renderZ: 40,
    output: { count: 2, position: new Float32Array([0, 12, 0, 1, 0, 18, 0, 1]),
      rotation: new Float32Array(4), data: new Float32Array(8), minHeight: 12, maxHeight: 18 } };
  page.update([tile]);
  assert.equal(page.mesh.frustumCulled, true);
  const box = page.geometry.boundingBox;
  for (const height of [12 - padding, 18 + padding]) {
    assert.ok(box.containsPoint(new Vector3(4 + padding, height, 40)));
  }
  const camera = new PerspectiveCamera(60, 1, 0.1, 200);
  camera.position.set(0, 15, 0);
  camera.lookAt(0, 15, -1);
  assert.equal(frustum(camera).intersectsObject(page.mesh), false);
  camera.lookAt(0, 15, 1);
  assert.equal(frustum(camera).intersectsObject(page.mesh), true, 'turning reveals the complete resident page');
  const auxiliary = new PerspectiveCamera(60, 1, 0.1, 200);
  auxiliary.position.set(40, 15, 40);
  auxiliary.lookAt(0, 15, 40);
  assert.equal(frustum(auxiliary).intersectsObject(page.mesh), true, 'auxiliary views use their own frustum');
  const oldRadius = page.geometry.boundingSphere.radius;
  tuning.widthScale.value = 10;
  tuning.flutterStrength.value = 2;
  page.bounds.setPadding(meadowBladeBoundsPadding(uniforms, tuning, 0.75));
  assert.ok(page.geometry.boundingSphere.radius > oldRadius, 'live shader edits expand the bounds without rebuilding stems');
  tile.renderX -= 4096;
  tile.renderZ -= 4096;
  page.update([tile]);
  camera.position.x -= 4096;
  camera.position.z -= 4096;
  camera.lookAt(-4096, 15, -4095);
  assert.equal(frustum(camera).intersectsObject(page.mesh), true);
  assert.equal(page.geometry.boundingSphere.center.x, -4096);
  assert.equal(page.geometry.boundingSphere.center.z, 40 - 4096);
});

test('a wind-bent card remains visible at the frustum edge', t => {
  const template = createMeadowTemplate({ detail: 1, count: 16, tileSize: 8, cards: true });
  const material = new MeshBasicNodeMaterial();
  const page = new MeadowBandBatch({ scene: new Scene(), template, material, name: 'cards', boundsPadding: 0 });
  t.after(() => { page.dispose(); template.dispose(); material.dispose(); });
  page.update([{ buildId: 1, renderX: 44, renderZ: -64,
    output: { count: 1, position: new Float32Array([0, 0, 0, 1]), rotation: new Float32Array(2),
      data: new Float32Array(4), minHeight: 0, maxHeight: 0 } }]);
  const camera = new PerspectiveCamera(60, 1, 0.1, 200);
  camera.position.set(0, 1, 0);
  camera.lookAt(0, 1, -1);
  const view = frustum(camera);
  assert.equal(view.intersectsObject(page.mesh), false, 'ground-only bounds miss the leaning silhouette');
  const width = 8, height = 2 * 1.25, reach = height * Math.sin(1.2);
  const toward = new Vector3(-44, 0, 64).normalize();
  const tip = new Vector3(44 - width / 2 * toward.z - reach * Math.SQRT1_2,
    height * Math.cos(1.2), -64 + width / 2 * toward.x - reach * Math.SQRT1_2);
  assert.equal(view.containsPoint(tip), true, 'the bent tip is actually inside the camera');
  page.bounds.setPadding(meadowCardBoundsPadding({ cardWidth: node(width), cardHeight: node(2) }));
  assert.equal(page.geometry.boundingBox.containsPoint(tip), true);
  assert.equal(view.intersectsObject(page.mesh), true);
});

test('compaction height bounds survive prefixes, append promotion and recycled outputs', () => {
  const small = createMeadowTemplate({ detail: 2, count: 16, tileSize: 8 });
  const large = createMeadowTemplate({ detail: 2, count: 64, tileSize: 8 });
  const sample = (x, z, rank, out) => {
    out.height = rank < 16 ? -12 + rank : 30 + rank;
    out.strength = 1;
    return true;
  };
  const first = createCompaction({ template: small, centerX: 0, centerZ: 0, sample });
  first.advance(Infinity);
  assert.equal(first.output.minHeight, -12);
  assert.equal(first.output.maxHeight, 3);
  const promoted = createCompaction({ template: large, centerX: 0, centerZ: 0, sample,
    previous: { output: first.output, capacity: 16 } });
  promoted.advance(Infinity);
  assert.equal(promoted.output.minHeight, -12);
  assert.equal(promoted.output.maxHeight, 93);
  const prefix = compactionPrefix(promoted.output, 16);
  assert.equal(prefix.count, 16);
  assert.equal(prefix.minHeight, -12);
  assert.equal(prefix.maxHeight, 93, 'prefix bounds conservatively cover the prepared tile');
  const rebuilt = createCompaction({ template: large, centerX: 0, centerZ: 0, output: promoted.output,
    sample: (x, z, rank, out) => { out.height = 5; out.strength = 1; return true; } });
  rebuilt.advance(Infinity);
  assert.equal(rebuilt.output.minHeight, 5);
  assert.equal(rebuilt.output.maxHeight, 5);
  small.dispose();
  large.dispose();
});
