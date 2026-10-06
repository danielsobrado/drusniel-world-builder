import assert from 'node:assert/strict';
import test from 'node:test';
import { MeshBasicNodeMaterial, Scene } from 'three/webgpu';
import { MeadowGrassBatches } from '../src/editor/stylized/meadow/MeadowGrassBatches.js';
import { createMeadowTemplate } from '../src/editor/stylized/meadow/meadowGrassGeometry.js';

function fixture(t) {
  const template = createMeadowTemplate({ detail: 2, count: 16, tileSize: 8 });
  const material = new MeshBasicNodeMaterial();
  const batches = new MeadowGrassBatches({ scene: new Scene(), templates: { low: template }, material, name: 'uploads' });
  t.after(() => { batches.dispose(); template.dispose(); material.dispose(); });
  const tile = count => ({ buildId: 1, renderX: 8, renderZ: -8,
    output: { count, position: new Float32Array(count * 4).fill(1),
      rotation: new Float32Array(count * 2).fill(2), data: new Float32Array(count * 4).fill(3) } });
  const commit = tiles => {
    batches.begin();
    for (const item of tiles) batches.add('low', item);
    batches.commit();
  };
  const geometry = batches.batches.get('low').pages[0].geometry;
  const attributes = ['instancePosition', 'instanceRotation', 'instanceData', 'instanceTile']
    .map(name => geometry.getAttribute(name));
  const uploaded = attributes.map(attribute => attribute.array.slice());
  const flush = () => {
    for (let i = 0; i < attributes.length; i += 1) {
      const attribute = attributes[i];
      for (const range of attribute.updateRanges) {
        uploaded[i].set(attribute.array.subarray(range.start, range.start + range.count), range.start);
      }
      attribute.clearUpdateRanges();
    }
  };
  return { batches, tile, commit, geometry, attributes, uploaded, flush };
}

test('meadow uploads and draws only populated stems after a density change', t => {
  const f = fixture(t);
  const tile = f.tile(7);
  f.commit([tile]);
  assert.deepEqual(f.attributes.map(a => a.updateRanges), [
    [{ start: 0, count: 28 }], [{ start: 0, count: 14 }],
    [{ start: 0, count: 28 }], [{ start: 0, count: 28 }],
  ]);
  f.flush();
  tile.buildId += 1;
  tile.output = f.tile(3).output;
  f.commit([tile]);
  assert.deepEqual(f.attributes[0].updateRanges, [{ start: 0, count: 12 }]);
  assert.deepEqual(f.attributes.slice(1).map(a => a.updateRanges), [
    [{ start: 0, count: 6 }], [{ start: 0, count: 12 }], [{ start: 0, count: 12 }],
  ]);
  f.flush();
  assert.equal(f.geometry.instanceCount, 3);
  assert.deepEqual(f.uploaded[0].subarray(0, 12), tile.output.position);
});

test('removing a meadow tile repacks all companion attributes together', t => {
  const f = fixture(t);
  const a = f.tile(7), b = f.tile(5);
  b.renderX = -16;
  b.output.position.fill(5);
  b.output.rotation.fill(6);
  b.output.data.fill(7);
  f.commit([a, b]);
  f.flush();
  f.commit([b]);
  assert.equal(f.geometry.instanceCount, 5);
  assert.deepEqual(f.attributes[0].updateRanges, [{ start: 0, count: 20 }]);
  f.flush();
  assert.deepEqual(f.uploaded[1].subarray(0, 10), b.output.rotation);
  assert.deepEqual(f.uploaded[2].subarray(0, 20), b.output.data);
  const c = f.tile(4);
  c.renderX = 24;
  f.commit([b, c]);
  f.flush();
  assert.equal(f.geometry.instanceCount, 9);
  assert.deepEqual(f.uploaded[0].subarray(5 * 4, 9 * 4), c.output.position);
  assert.equal(f.uploaded[3][0], b.renderX);
  assert.equal(f.uploaded[3][5 * 4], 24);
});

test('a meadow rebase uploads tile origins without resending stem data', t => {
  const f = fixture(t);
  const tile = f.tile(7);
  f.commit([tile]);
  f.flush();
  const versions = f.attributes.slice(0, 3).map(a => a.version);
  tile.renderX -= 4096;
  tile.renderZ += 4096;
  f.commit([tile]);
  assert.deepEqual(f.attributes.slice(0, 3).map(a => a.version), versions);
  assert.deepEqual(f.attributes[3].updateRanges, [{ start: 0, count: 28 }]);
  f.flush();
  assert.equal(f.uploaded[3][0], tile.renderX);
  assert.equal(f.uploaded[3][1], tile.renderZ);
});

test('meadow retains pending upload ranges until a draw consumes them', t => {
  const f = fixture(t);
  const a = f.tile(7), b = f.tile(5);
  f.commit([a, b]);
  f.flush();
  a.buildId += 1;
  a.output.position.fill(4);
  f.commit([a, b]);
  b.buildId += 1;
  b.output.position.fill(5);
  f.commit([a, b]);
  f.flush();
  assert.deepEqual(f.uploaded[0].subarray(0, 28), a.output.position);
  assert.deepEqual(f.uploaded[0].subarray(7 * 4, 12 * 4), b.output.position);
});

test('meadow pages bound buffer capacity and reuse storage through tile churn', t => {
  const f = fixture(t);
  const tiles = Array.from({ length: 13 }, (_, i) => {
    const tile = f.tile(3 + i % 5);
    tile.renderX = i * 8;
    tile.renderZ = -24;
    tile.output.position.fill(i + 1);
    tile.output.rotation.fill(i + 2);
    tile.output.data.fill(i + 3);
    return tile;
  });
  f.commit(tiles);
  const band = f.batches.batches.get('low');
  const pages = band.meshes.map(mesh => mesh.geometry);
  assert.equal(pages.length, 4);
  assert.ok(pages.every(geometry => geometry.getAttribute('instancePosition').count === 4 * 16));
  assert.equal(band.pages.reduce((sum, page) => sum + page.members.length, 0), tiles.length);
  // Each publication keeps its origin and all three companion attributes in
  // the same slot, irrespective of which page owns it.
  for (const tile of tiles) {
    const page = band.slots.get(tile), slot = page.slots.get(tile);
    const offset = slot.start;
    for (const [name, field, width] of [['instancePosition', 'position', 4],
      ['instanceRotation', 'rotation', 2], ['instanceData', 'data', 4]]) {
      assert.deepEqual(page.geometry.getAttribute(name).array.subarray(offset * width,
        (offset + tile.output.count) * width), tile.output[field]);
    }
    assert.equal(page.geometry.getAttribute('instanceTile').array[offset * 4], tile.renderX);
  }
  for (let round = 0; round < 10; round += 1) {
    f.commit(tiles.slice(round % 5, round % 5 + 8));
    f.commit(tiles);
  }
  assert.deepEqual(band.meshes.map(mesh => mesh.geometry), pages, 'churn reuses pages without reallocating');
  f.commit([]);
  assert.ok(band.meshes.every(mesh => !mesh.visible && mesh.geometry.instanceCount === 0));
});
