import assert from 'node:assert/strict';
import test from 'node:test';
import { StagedTextureUploads } from '../src/render/preparation/StagedTextureUploads.js';

function fixture(block = { width: 4, height: 4, byteLength: 16 }) {
  const records = new Map(), initialized = new Set(), writes = [], destroyed = [];
  const backend = {
    isWebGPUBackend: true,
    get(texture) { if (!records.has(texture)) records.set(texture, {}); return records.get(texture); },
    delete(texture) { records.delete(texture); },
    textureUtils: { _getBlockData: () => block },
    createTexture(texture) {
      Object.assign(this.get(texture), { initialized: true, textureDescriptorGPU: { format: 'test' },
        texture: { destroy() { destroyed.push(this); } } });
    },
    updateTexture() { assert.fail('normal upload would repeat the staged transfer'); },
    device: { queue: { writeTexture(dest, data, layout, extent) { writes.push({ dest, data, layout, extent }); },
      copyExternalImageToTexture(source, dest, extent) { writes.push({ source, dest, extent }); } } },
  };
  const manager = { has: texture => initialized.has(texture), getSize: texture => ({ width: texture.image.width, height: texture.image.height, depth: 1 }),
    needsMipmaps: texture => texture.mipmaps.length > 1, getMipLevels: texture => texture.mipmaps.length };
  const renderer = { backend, _textures: manager, initTexture(texture) {
    backend.createTexture(texture); backend.updateTexture(texture); initialized.add(texture);
  } };
  const stage = new StagedTextureUploads(renderer);
  const texture = { isCompressedTexture: true, version: 1, source: { version: 1, dataReady: true },
    image: { width: 16, height: 8 }, mipmaps: [
      { width: 16, height: 8, data: new Uint8Array(128) },
      { width: 8, height: 4, data: new Uint8Array(32) },
      { width: 4, height: 2, data: new Uint8Array(16) },
    ] };
  return { stage, texture, backend, initialized, writes, destroyed };
}

test('compressed mip and partial block rows stay detached until all writes finish', () => {
  const { stage, texture, backend, initialized, writes } = fixture();
  let total = 0, turns = 0;
  for (;;) {
    const result = stage.advance(texture, 48, () => false);
    assert.ok(result.bytes <= 48); total += result.bytes;
    assert.ok(++turns < 20);
    if (result.ready) break;
    assert.equal(initialized.has(texture), false);
    assert.equal(backend.get(texture).texture, undefined);
  }
  assert.equal(total, 176);
  assert.equal(initialized.has(texture), true);
  assert.ok(writes.every(write => write.dest.texture === backend.get(texture).texture));
  assert.ok(writes.some(write => write.dest.origin.x > 0));
  assert.deepEqual([...new Set(writes.map(write => write.dest.mipLevel))], [0, 1, 2]);
});

test('version changes and cancel release only detached resources', () => {
  const { stage, texture, destroyed, initialized } = fixture();
  stage.advance(texture, 32, () => false);
  texture.version++;
  stage.advance(texture, 32, () => false);
  assert.equal(destroyed.length, 1);
  stage.cancel(texture); stage.cancel(texture);
  assert.equal(destroyed.length, 2);
  assert.equal(initialized.has(texture), false);
});

test('external image uploads crop in rows without exposing partial content', () => {
  const { stage, texture, writes } = fixture({ width: 1, height: 1, byteLength: 4 });
  texture.isCompressedTexture = false; texture.mipmaps = [];
  texture.image = { width: 16, height: 8 };
  let bytes = 0;
  for (let turn = 0; turn < 16; turn++) {
    const result = stage.advance(texture, 128, () => false);
    bytes += result.bytes;
    if (result.ready) break;
  }
  assert.equal(bytes, 512);
  assert.deepEqual(writes.map(write => write.source.origin.y), [0, 2, 4, 6]);
});
