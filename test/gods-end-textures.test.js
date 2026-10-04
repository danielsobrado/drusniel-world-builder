import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import * as THREE from 'three/webgpu';
import {
  generateSurfaceData, createLeafTexture, createSeaDetailTexture, createBarrierNoise,
  createWaterfallStrandPixels, createSprayPuffPixels,
} from '../src/editor/assets/godsEnd/textures.js';
import { acquireSeaDetailTexture } from '../src/editor/assets/godsEnd/seaDetailCache.js';
import { acquireSnowTextures } from '../src/editor/assets/godsEnd/snowTextures.js';
import { getSurfaceTextures, getSurfaceMaterial, disposeProceduralSurfaces } from '../src/editor/assets/proceduralSurfaces.js';
import { createFallingLeafTexture } from '../src/editor/stylized/leaves/FallingLeafTextures.js';

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
// Captured directly from gods-end's generators on 2026-10-04, before adapting imports.
const HOUSE_HASHES = {
  stone: ['035ce468a3f574a4605613895c631fab6f51c9e8fc514bde772ef5a777ccbf65', '57c3194bb0d992a969d7e921a9fa977420c2d2d1fe4d7fafb3ac5c9013a21871'],
  darkStone: ['df1f90e7f4c0a7da7fd6294d16945fa1a8ad9e3c93025644ebc29da08d993b5e', 'c321046c4b25d58e51bf67b62cacd6631f601b010bd3f6f8731728273f532ccb'],
  plaster: ['f128d4f66e179b68bb37548fbee0004558c034582e9cc65d171f7bb305be9905', 'd28a021dec3cb6bc319c2b1c20291d07ce1d816d99ba60affd11872f5a4a2c23'],
  wood: ['e43666dc26a9d9b0d1ceff0b775cc1617eaa477a05642044f605abb61224d844', 'c0f340ff5744883aee34ef19a35f211f1a1abdec0e01a44fe1bf6dfa61de828a'],
  planks: ['fcef124acdde8e030c61766a1e7f7795b64d411e225b5128eca84931611b4b0d', '20a8710d457624419bdfe8a98857e4f7d9086d5ab9e1669e190b4289eff14498'],
  deck: ['f7b6f20326d9efe614758944fc1591b619961619b4d466d55d44223091bc63b1', 'b123ac3a293c0a0f452a46c700e57dfeeb9cf57a04ae739c47f1812a0f3421f4'],
  roofTiles: ['2b27881091b5d2eef1ca672a6c9e90ed3201f81a23e59deca51d921dffb7aa64', '25a17ff86c6610f893afa8f42e527f18f07168151d313e49a0ad0edacb028958'],
  roofSlate: ['bf30b0cbef99f9b58828473a71f9d08187a81ebb20e926582e1209aa30407f63', 'f19d6bc48d84db8b4df80bc144b15ccb2db3c0847b83143f6d743c662e2508ff'],
  window: ['35a972e04422501f0bca6d38e36d858e2d56e9903c85906d684a133089c126b1', '633ab32f7a8c1069a03545ed1671ffa6f0658efd207ed8c1850a5eaaceb8ec28'],
};

test('all nine village albedo/normal pairs retain the donor pixels', () => {
  for (const [name, expected] of Object.entries(HOUSE_HASHES)) {
    const pixels = generateSurfaceData(name);
    assert.deepEqual([hash(pixels.color), hash(pixels.normal)], expected, name);
  }
  assert.throws(() => generateSurfaceData('__proto__'), /Unknown/);
});

test('falling leaves, sea detail and barrier noise retain donor pixels', () => {
  const expected = {
    green: '0570fd4900e1b3fccc5a9480746a7bbef8dcd132703c1e5d59bfc43fa5e981a8',
    yellow: '50aa63404fc6d47b5c2f6725aca23f96d22ce458264bff27c3ebed9a8e9a9729',
    white: 'ffd1b6d5d9622a10a074ef23a91a3bb36bf4d35fb54aa874fc9436c06f446e0c',
  };
  const atlas = createFallingLeafTexture();
  for (const [layer, zone] of Object.keys(expected).entries()) {
    const leaf = createLeafTexture(zone);
    assert.equal(hash(leaf.image.data), expected[zone]);
    assert.deepEqual(atlas.image.data.slice(layer * 256 * 256 * 4, (layer + 1) * 256 * 256 * 4), leaf.image.data);
    leaf.dispose();
  }
  atlas.dispose();
  const sea = createSeaDetailTexture();
  assert.equal(hash(sea.image.data), '38f134281d88131f1fdd1b4748659cd39a818c7f5dc6ed106a2bd75cbe4707a3');
  sea.dispose();
  const barrier = createBarrierNoise();
  assert.equal(hash(barrier.image.data), 'f3ad5a6a76047e9991b54453b5ba8377a27a4257d039f250fa83f03ef0611eba');
  barrier.dispose();
});

test('existing waterfall and spray ports match the donor at its native resolution', () => {
  assert.equal(hash(createWaterfallStrandPixels({ width: 512, height: 128 }).data), 'c60aa6d9264b91c8cd92ad2cf8146b16813e3454227495ccb805cf91bf5d3a7d');
  assert.equal(hash(createSprayPuffPixels().data), '24c26d76eb4fe4e0d4d5144ccafbc8319274a9d64cb445a40efc685972003453');
});

test('catalog shares donor maps, preserves color spaces and releases every cached map', () => {
  const a = getSurfaceTextures('stoneBlock');
  assert.equal(a, getSurfaceTextures('stoneBlock'));
  assert.equal(getSurfaceMaterial('stoneBlock').map, a.map);
  assert.equal(a.map.image.width, 512);
  assert.equal(a.map.colorSpace, THREE.SRGBColorSpace);
  assert.equal(a.normalMap.colorSpace, THREE.NoColorSpace);
  assert.equal(a.map.generateMipmaps, true);
  assert.equal(getSurfaceMaterial('window').roughness, 0.35);
  let disposed = 0;
  Object.values(a).forEach((map) => map.addEventListener('dispose', () => { disposed += 1; }));
  disposeProceduralSurfaces();
  assert.equal(disposed, 3);
  assert.notEqual(getSurfaceTextures('stoneBlock').map, a.map);
  disposeProceduralSurfaces();
});

test('sea maps live until the last water material releases them', () => {
  const a = acquireSeaDetailTexture(4);
  const b = acquireSeaDetailTexture(4);
  const c = acquireSeaDetailTexture(2);
  assert.equal(a.texture, b.texture);
  assert.notEqual(a.texture, c.texture);
  let disposed = 0;
  a.texture.addEventListener('dispose', () => { disposed += 1; });
  a.release(); a.release();
  assert.equal(disposed, 0);
  b.release();
  assert.equal(disposed, 1);
  c.release();
});

test('snow loads once, waits for all maps and ignores completion after disposal', () => {
  const callbacks = [];
  const loader = { load(url, done, progress, fail) {
    callbacks.push({ url, done, fail });
    return new THREE.Texture();
  } };
  const a = acquireSnowTextures({ loader, baseUrl: '/preview/' });
  const b = acquireSnowTextures({ loader });
  assert.equal(callbacks.length, 3);
  assert.equal(a.color, b.color);
  assert.ok(callbacks.every(({ url }) => url.startsWith('/preview/assets/textures/snow/')));
  assert.equal(a.ready.value, 0);
  callbacks[0].done(); callbacks[1].done();
  assert.equal(a.ready.value, 0);
  callbacks[2].done();
  assert.equal(a.ready.value, 1);
  assert.equal(a.color.colorSpace, THREE.SRGBColorSpace);
  assert.equal(a.packed.colorSpace, THREE.NoColorSpace);
  let disposed = 0;
  a.color.addEventListener('dispose', () => { disposed += 1; });
  a.release(); a.release();
  assert.equal(disposed, 0);
  b.release();
  assert.equal(disposed, 1);
  const c = acquireSnowTextures({ loader });
  c.release();
  callbacks.slice(3).forEach(({ done }) => done());
  assert.equal(c.ready.value, 0);
  const d = acquireSnowTextures({ loader });
  callbacks[6].fail(); callbacks[7].done(); callbacks[8].done();
  assert.equal(d.ready.value, 0);
  d.release();
});
