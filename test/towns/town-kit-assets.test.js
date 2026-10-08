import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three/webgpu';

import { TOWN_KIT_LOD_GLB, TownKitAssets } from '../../src/editor/towns/TownKitAssets.js';
import { KIT_DATA_ATTRIBUTE } from '../../src/editor/towns/TownKitGeometry.js';

function quad(y = 0) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, y, 0, 1, y, 0, 1, y + 1, 0, 0, y + 1, 0], 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  return geometry;
}

function material(name, image = null) {
  const m = new THREE.MeshStandardMaterial({ name });
  if (image) m.map = new THREE.Texture(image);
  return m;
}

/** A glTF-like scene: { module: { interior?, prims: [[material, geometry]] } }. */
function gltf(modules) {
  return {
    scene: {
      children: Object.entries(modules).map(([name, { interior = false, prims }]) => {
        const group = new THREE.Group();
        group.name = name;
        group.userData.kit_interior = interior;
        for (const [mat, geometry] of prims) group.add(new THREE.Mesh(geometry, mat));
        return group;
      }),
    },
  };
}

function assetsWith(near, far) {
  const loader = {
    async loadAsync(url) {
      if (url.endsWith(TOWN_KIT_LOD_GLB)) {
        if (!far) throw new Error('404');
        return far;
      }
      return near;
    },
  };
  return new TownKitAssets({
    loader,
    fetchJson: async () => ({ prefabs: {} }),
    readPixels: (image, size) => new Uint8Array(size * size * 4),
  });
}

async function quietly(fn) {
  const warn = console.warn;
  console.warn = () => {};
  try {
    return await fn();
  } finally {
    console.warn = warn;
  }
}

test('a module merges its kit materials into one geometry and keeps glass apart', async () => {
  const stone = material('M_stone', { id: 'stone-image' });
  const timber = material('M_timber', { id: 'timber-image' });
  const glass = material('M_glass', { id: 'window-image' });
  const near = gltf({ Wall_Stone_Window: { prims: [[stone, quad()], [timber, quad(1)], [glass, quad(2)]] } });
  const far = gltf({ Wall_Stone_Window: { prims: [[material('M_timber'), quad()]] } });
  const assets = assetsWith(near, far);
  await assets.ensure();
  assert.equal(assets.ready, true);
  const module = assets.modules.get('Wall_Stone_Window');
  assert.equal(module.glass.length, 1);
  const data = module.opaque.getAttribute(KIT_DATA_ATTRIBUTE);
  assert.equal(data.count, 8);
  assert.equal(data.getZ(0), assets.atlas.index('M_stone'));
  assert.equal(data.getZ(4), assets.atlas.index('M_timber'));
  assert.equal(assets.glassSource, glass);
  const farData = assets.farModules.get('Wall_Stone_Window').opaque.getAttribute(KIT_DATA_ATTRIBUTE);
  assert.equal(farData.getZ(0), assets.atlas.index('M_timber'), 'far kit indexes the near atlas by name');
  assert.ok(assets.atlas.row('M_stone').albedoLayer > 0, 'textured materials get their own layer');
});

test('interior modules are listed for near-only drawing', async () => {
  const near = gltf({
    Table: { interior: true, prims: [[material('M_planks'), quad()]] },
    Wall_Stone: { prims: [[material('M_stone'), quad()]] },
  });
  const assets = assetsWith(near, null);
  await quietly(() => assets.ensure());
  assert.equal(assets.isInterior('Table'), true);
  assert.equal(assets.isInterior('Wall_Stone'), false);
  assert.equal(assets.farModules.size, 0, 'a missing far kit leaves the near kit usable');
});
