import assert from 'node:assert/strict';
import test from 'node:test';
import { BufferGeometry, Float32BufferAttribute, Mesh, MeshBasicMaterial, PerspectiveCamera, Scene } from 'three/webgpu';
import { DensityGrid } from '../src/editor/locations/gen/DensityGrid.js';
import { LocationPortalGraph } from '../src/editor/locations/gen/LocationPortalGraph.js';
import { LocationPortalVisibility } from '../src/editor/locations/LocationPortalVisibility.js';
import { resolveRenderEnhancements } from '../src/config/RenderEnhancements.js';

const settings = { ...resolveRenderEnhancements().locationStructureBudget, portalCellMeters: 10 };

function volume() {
  const grid = new DensityGrid({ min: { x: 0, y: 0, z: 0 }, max: { x: 40, y: 10, z: 10 }, voxel: 1 });
  for (let z = 3; z <= 7; z++) {
    for (let y = 3; y <= 7; y++) {
      for (let x = 1; x <= 39; x++) {
        if (x <= 16 || x >= 31) grid.data[x + y * grid.sy + z * grid.sz] = 1;
      }
    }
  }
  return grid;
}

test('padded portal slabs preserve openings and reject sealed sections', () => {
  const grid = volume(), graph = LocationPortalGraph.build(grid, settings);
  const result = new Uint8Array(graph.count);
  assert.equal(graph.reachable([0], result), 2);
  assert.deepEqual([...result], [1, 1, 0, 0]);
  assert.deepEqual(graph.cellsFor([10, 5, 5], [10, 5, 5]), [0, 1]);
  grid.data[18 + 5 * grid.sy + 5 * grid.sz] = 0;
  const uncertain = LocationPortalGraph.build(grid, settings);
  assert.equal(uncertain.reachable([0], result), 4);
});

test('graph work and size caps fail open and open volumes are excluded', () => {
  const grid = volume();
  assert.equal(LocationPortalGraph.build(grid, { ...settings, portalMaxCells: 1 }), null);
  assert.equal(LocationPortalGraph.build(grid, { ...settings, portalMaxSampleReads: 1 }), null);
  grid.open = true;
  assert.equal(LocationPortalGraph.build(grid, settings), null);
});

function fixture(t, portalCull) {
  const grid = volume(), graph = LocationPortalGraph.build(grid, settings), scene = new Scene();
  function section(x) {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute([x, 4, 4, x, 6, 4, x, 5, 6], 3));
    const mesh = new Mesh(geometry, new MeshBasicMaterial());
    mesh.userData.locationStructure = true;
    scene.add(mesh);
    return mesh;
  }
  const near = section(15), distant = section(35), spanning = section(10);
  const camera = new PerspectiveCamera(70, 1, 0.1, 100);
  camera.position.set(5, 5, 5);
  camera.lookAt(40, 5, 5);
  const visibility = new LocationPortalVisibility(scene, graph, { ...settings, portalCull }, grid);
  t.after(() => { visibility.dispose(); scene.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); }); });
  return { visibility, camera, near, distant, spanning };
}

test('audit predicts disconnected sections without changing visibility', t => {
  const { visibility, camera, near, distant } = fixture(t, false);
  visibility.update(camera);
  assert.equal(visibility.valid, true);
  assert.equal(visibility.canPrefetch(near), true);
  assert.equal(visibility.canPrefetch(distant), false);
  assert.equal(distant.visible, true);
});

test('culling preserves connected sections and restores on camera teleport', t => {
  const { visibility, camera, near, distant, spanning } = fixture(t, true);
  visibility.update(camera);
  assert.equal(near.visible, true);
  assert.equal(spanning.visible, true);
  assert.equal(distant.visible, false);
  camera.position.set(35, 5, 5);
  camera.lookAt(39, 5, 5);
  visibility.update(camera);
  assert.equal(distant.visible, true);
  camera.position.set(20, 5, 5);
  visibility.update(camera);
  assert.equal(visibility.valid, false);
  assert.equal(near.visible, true);
  assert.equal(distant.visible, true);
});

test('unsupported projection and moving geometry restore owned visibility', t => {
  const { visibility, camera, near, distant } = fixture(t, true);
  visibility.update(camera);
  assert.equal(distant.visible, false);
  camera.setViewOffset(100, 100, 0, 0, 50, 50);
  visibility.update(camera);
  assert.equal(distant.visible, true);
  camera.clearViewOffset();
  visibility.update(camera);
  near.position.x = 1;
  visibility.update(camera);
  assert.equal(visibility.valid, false);
  assert.equal(distant.visible, true);
});

test('portal flags are separate and off by default', () => {
  const defaults = resolveRenderEnhancements().locationStructureBudget;
  assert.equal(defaults.portalEnabled, false);
  assert.equal(defaults.portalCull, false);
  const options = resolveRenderEnhancements({}, '?locationPortalVisibility=1&locationPortalCull=1').locationStructureBudget;
  assert.equal(options.portalEnabled, true);
  assert.equal(options.portalCull, true);
  assert.throws(() => resolveRenderEnhancements({ locationStructureBudget: { portalMaxCells: 1.5 } }), RangeError);
});
