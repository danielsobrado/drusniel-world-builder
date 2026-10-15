import assert from 'node:assert/strict';
import test from 'node:test';
import { MeshBasicNodeMaterial, Scene } from 'three/webgpu';
import { MeadowTileLayer } from '../src/editor/stylized/meadow/MeadowTileLayer.js';
import { createMeadowTemplate } from '../src/editor/stylized/meadow/meadowGrassGeometry.js';

function fixture(t) {
  const count = 40401;
  const templates = Object.fromEntries([['high', 5], ['medium', 3]].map(([band, detail]) =>
    [band, createMeadowTemplate({ detail, count, tileSize: 8 })]));
  const material = new MeshBasicNodeMaterial();
  const layer = new MeadowTileLayer({ scene: new Scene(), name: 'lod-page', templates,
    material, tileSize: 8, reach: 16, ground: {}, selectBand: () => 'high' });
  layer.time = 1;
  t.after(() => { layer.dispose(); material.dispose(); });
  const tile = (key, band, x) => {
    const output = { count, position: new Float32Array(count * 4).fill(1),
      rotation: new Float32Array(count * 2).fill(2), data: new Float32Array(count * 4),
      minHeight: 0, maxHeight: 1 };
    for (let i = 0; i < count; i++) output.data[i * 4 + 1] = i;
    const value = { key, band, revision: 1, renderX: x, renderZ: 0, inView: true,
      prepared: { output, capacity: count, revision: 1, band }, output: null };
    layer.tiles.set(key, value);
    return value;
  };
  const publish = (value, band = value.band) => {
    value.band = band;
    assert.equal(layer.publishPrepared(value), true);
  };
  const page = value => layer.batches.batches.get(value.band).slots.get(value);
  const attributes = value => Object.values(page(value).geometry.attributes).filter(a => a.isInstancedBufferAttribute);
  const flush = value => attributes(value).forEach(a => a.clearUpdateRanges());
  return { layer, templates, tile, publish, page, attributes, flush };
}

test('a prepared dense LOD transition retains its GPU page and changes only blade detail', t => {
  const f = fixture(t), tile = f.tile('0:0', 'high', 0);
  f.publish(tile); f.layer.commit(); f.flush(tile);
  const page = f.page(tile), attributes = f.attributes(tile);
  const versions = attributes.map(a => a.version);
  const firstBuild = tile.buildId;
  for (const band of ['medium', 'high', 'medium']) {
    f.publish(tile, band); f.layer.commit();
    assert.ok(tile.buildId > firstBuild, 'exercise actual LOD publication, including its new build ID');
    assert.equal(f.page(tile) === page, true, 'same populated stems retain their GPU page across LOD bands');
    assert.equal(page.geometry.getAttribute('position'), f.templates[band].getAttribute('position'));
    assert.equal(page.geometry.index, f.templates[band].index);
    assert.deepEqual(attributes.map(a => a.version), versions, 'no instance data is uploaded again');
    assert.equal(page.geometry.instanceCount, tile.output.count);
  }
});

test('simultaneous dense LOD swaps retain both pages and still upload a revised ground result', t => {
  const f = fixture(t), a = f.tile('0:0', 'high', 0), b = f.tile('1:0', 'medium', 8);
  f.publish(a); f.publish(b); f.layer.commit(); f.flush(a); f.flush(b);
  const pageA = f.page(a), pageB = f.page(b);
  f.publish(a, 'medium'); f.publish(b, 'high'); f.layer.commit();
  assert.equal(f.page(a) === pageA && f.page(b) === pageB, true, 'both directions transfer without overwriting ownership');
  assert.ok([...f.attributes(a), ...f.attributes(b)].every(attribute => attribute.updateRanges.length === 0));
  // A pooled array may have the same identity with new ground contents. The
  // prepared generation, rather than just the array, must invalidate the page.
  a.revision = 2;
  a.prepared = { ...a.prepared, revision: 2 };
  a.prepared.output.position[1] = 7;
  f.publish(a); f.layer.commit();
  assert.equal(f.page(a).geometry.getAttribute('instancePosition').array[1], 7);
  assert.ok(f.attributes(a).every(attribute => attribute.updateRanges.length > 0));
  f.flush(a);
  const versions = f.attributes(a).slice(0, 3).map(attribute => attribute.version);
  a.renderX -= 4096;
  f.layer.batchDirty = true; f.layer.commit();
  assert.deepEqual(f.attributes(a).slice(0, 3).map(attribute => attribute.version), versions);
  assert.equal(f.page(a).geometry.getAttribute('instanceTile').array[0], a.renderX);
});

test('LOD page transfers recycle empty compatible pages through repeated teleports', t => {
  const f = fixture(t);
  for (let i = 0; i < 12; i++) {
    f.layer.tiles.clear();
    const tile = f.tile(`${i}:0`, 'high', i * 128);
    f.publish(tile); f.layer.commit();
    f.publish(tile, 'medium'); f.layer.commit();
    const pages = [...f.layer.batches.batches.values()].flatMap(band => band.pages);
    assert.equal(pages.length, 2, 'empty transferred pages remain reusable by either compatible band');
    assert.equal(pages.filter(page => page.mesh.visible).length, 1);
  }
});
