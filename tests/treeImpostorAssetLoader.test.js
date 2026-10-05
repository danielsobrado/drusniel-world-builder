import assert from 'node:assert/strict';
import test from 'node:test';
import {
  TreeImpostorAssetLoader,
} from '../src/editor/stylized/impostor/TreeImpostorAssets.js';
import {
  TREE_IMPOSTOR_LEGACY_MANIFEST_VERSION,
  TREE_IMPOSTOR_MANIFEST_VERSION,
  TREE_IMPOSTOR_NORMAL_ENCODING,
} from '../src/editor/stylized/impostor/TreeImpostorManifest.js';

function prototype(index = 0) {
  return {
    prototypeIndex: index,
    columns: 8,
    rows: 2,
    tileSize: 128,
    gutter: 4,
    lowElevationDegrees: 12,
    highElevationDegrees: 58,
    width: 7,
    height: 9,
    depth: 6,
    centerY: 4.5,
    radius: 5,
    albedo: `/assets/impostors/trees/prototype-${index}-albedo.png`,
    normal: `/assets/impostors/trees/prototype-${index}-normal.png`,
  };
}

function response(version, extra = {}) {
  return {
    ok: true,
    json: async () => ({
      version,
      generatedAt: '2026-07-27T00:00:00.000Z',
      sourceSignature: version === TREE_IMPOSTOR_MANIFEST_VERSION
        ? 'tree-impostor-v2-current'
        : 'tree-impostor-v1-legacy',
      prototypes: [{
        ...prototype(),
        ...(version === TREE_IMPOSTOR_MANIFEST_VERSION
          ? { normalEncoding: TREE_IMPOSTOR_NORMAL_ENCODING }
          : {}),
      }],
      ...extra,
    }),
  };
}

test('legacy atlases are bypassed before texture upload', async () => {
  let loads = 0;
  const loader = new TreeImpostorAssetLoader({
    fetchImpl: async () => response(TREE_IMPOSTOR_LEGACY_MANIFEST_VERSION),
    loader: {
      loadAsync: async () => {
        loads += 1;
        return { dispose() {} };
      },
    },
    expectedPrototypeCount: 1,
    expectedSourceSignature: 'tree-impostor-v2-current',
  });

  assert.equal(await loader.load('/assets/impostors/trees/manifest.json'), null);
  assert.equal(loads, 0);
});

test('v3 atlases load only when signature and mask encoding match', async () => {
  const textures = [];
  const loader = new TreeImpostorAssetLoader({
    fetchImpl: async () => response(TREE_IMPOSTOR_MANIFEST_VERSION),
    loader: {
      loadAsync: async (path) => {
        const texture = { path, dispose() {} };
        textures.push(texture);
        return texture;
      },
    },
    expectedPrototypeCount: 1,
    expectedSourceSignature: 'tree-impostor-v2-current',
  });

  const atlases = await loader.load('/assets/impostors/trees/manifest.json');
  assert.equal(atlases.length, 1);
  assert.equal(textures.length, 2);
  assert.equal(atlases[0].normalEncoding, TREE_IMPOSTOR_NORMAL_ENCODING);
});

function compressedPrototype(index = 0) {
  return { ...prototype(index), albedoMips: `/assets/impostors/trees/prototype-${index}-albedo-mips.bin`,
    albedoKtx2: `/assets/impostors/trees/prototype-${index}-albedo.ktx2`, albedoKtx2Metadata: { sha256: 'compressed-hash' } };
}

test('compressed atlas loads by content version without touching the RGBA fallback', async () => {
  const texture = { isCompressedTexture: true, image: { width: 1024, height: 256 }, mipmaps: [{}, {}] };
  let path, disposed = false;
  const loader = new TreeImpostorAssetLoader({
    fetchImpl: async () => response(TREE_IMPOSTOR_MANIFEST_VERSION, { prototypes: [compressedPrototype()] }),
    loader: { loadAsync: async () => ({ dispose() {} }) },
    compressedLoader: { loadAsync: async url => { path = url; return texture; }, dispose: () => { disposed = true; } },
    mipLoader: async () => { throw new Error('Fallback should not load.'); },
  });
  const [atlas] = await loader.load('/assets/impostors/trees/manifest.json');
  assert.equal(atlas.albedo, texture);
  assert.ok(path.endsWith('.ktx2?v=compressed-hash'));
  assert.equal(disposed, false, 'Injected loader retains caller ownership.');
  assert.equal(texture.generateMipmaps, false);
});

test('invalid compressed atlas is disposed and falls back to the baked alpha-preserving chain', async () => {
  let disposed = false, fallbackPath;
  const fallback = { mipmaps: [{}, {}], dispose() {} };
  const loader = new TreeImpostorAssetLoader({
    fetchImpl: async () => response(TREE_IMPOSTOR_MANIFEST_VERSION, { prototypes: [compressedPrototype()] }),
    loader: { loadAsync: async () => ({ dispose() {} }) },
    compressedLoader: { loadAsync: async () => ({ isCompressedTexture: true, image: { width: 4, height: 4 },
      mipmaps: [{}], dispose: () => { disposed = true; } }) },
    mipLoader: async path => { fallbackPath = path; return fallback; },
  });
  const [atlas] = await loader.load('/assets/impostors/trees/manifest.json');
  assert.equal(disposed, true); assert.equal(atlas.albedo, fallback);
  assert.match(fallbackPath, /-albedo-mips.bin/); assert.equal(fallback.generateMipmaps, false);
});

test('atlas failure disposes completed compressed albedos and sibling prototypes', async () => {
  let disposed = 0;
  const disposable = extra => ({ ...extra, dispose: () => { disposed++; } });
  const loader = new TreeImpostorAssetLoader({
    fetchImpl: async () => response(TREE_IMPOSTOR_MANIFEST_VERSION, { prototypes: [compressedPrototype(), compressedPrototype(1)] }),
    loader: { loadAsync: async path => {
      if (path.includes('prototype-1-normal')) throw new Error('Normal failed.');
      return disposable({});
    } },
    compressedLoader: { loadAsync: async () => disposable({ isCompressedTexture: true,
      image: { width: 1024, height: 256 }, mipmaps: [{}, {}] }) },
  });
  await assert.rejects(loader.load('/assets/impostors/trees/manifest.json'), /Normal failed/);
  assert.equal(disposed, 3);
});
