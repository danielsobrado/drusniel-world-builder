import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three/webgpu';
import { applyShapeSurfaceMaterials } from '../src/editor/workshop/shapes/ShapeSurfaceMaterials.js';
import { disposeUnusedModelMaterials, disposeModelParts } from '../src/editor/assets/modelParts.js';
import { normalizeProceduralRecipe } from '../src/editor/workshop/ProceduralAssetStore.js';
import { createWorkshopCompositionParts } from '../src/editor/workshop/ProceduralWorkshopCompositionGenerator.js';
import { createShapePreset } from '../src/editor/workshop/shapes/ShapePresets.js';

const materials = () => Object.fromEntries(['mortar', 'stone', 'wood', 'roof', 'recess'].map((slot) =>
  [slot, new THREE.MeshStandardNodeMaterial({ color: '#ffffff' })]));

test('surface pixels are reused while every product owns independent GPU texture objects', () => {
  const a = materials(), b = materials(), recipe = { seed: 874, detail: 2 };
  applyShapeSurfaceMaterials(a, recipe, new Set([a.stone]));
  applyShapeSurfaceMaterials(b, recipe, new Set([b.stone]));
  try {
    for (const key of ['normalMap', 'roughnessMap']) {
      assert.ok(a.stone[key].isDataTexture);
      assert.notEqual(a.stone[key], b.stone[key]);
      assert.equal(a.stone[key].image.data, b.stone[key].image.data);
      assert.equal(a.stone[key].generateMipmaps, true);
      assert.equal(b.stone[key].generateMipmaps, true);
      assert.equal(a.stone[key].colorSpace, THREE.NoColorSpace);
      assert.equal(b.stone[key].wrapS, THREE.RepeatWrapping);
    }
    for (const slot of ['mortar', 'wood', 'roof']) {
      assert.equal(a[slot].normalMap, null);
      assert.equal(a[slot].roughnessMap, null);
    }
  } finally {
    disposeUnusedModelMaterials(Object.values(a));
    disposeUnusedModelMaterials(Object.values(b));
  }
});

test('unused materials retire unreferenced maps once and preserve maps retained by clones', () => {
  const source = new THREE.MeshStandardNodeMaterial(), unused = source.clone(), kept = source.clone();
  const held = new THREE.Texture(), retired = new THREE.Texture(), shared = new THREE.Texture();
  shared.userData.sharedSurface = true;
  source.normalMap = held;
  source.roughnessMap = retired;
  unused.normalMap = retired;
  unused.roughnessMap = shared;
  kept.normalMap = held;
  const disposed = { source: 0, unused: 0, kept: 0, held: 0, retired: 0, shared: 0 };
  for (const [name, resource] of Object.entries({ source, unused, kept, held, retired, shared }))
    resource.addEventListener('dispose', () => disposed[name]++);
  disposeUnusedModelMaterials([source, source, unused, kept], new Set([kept]));
  assert.deepEqual(disposed, { source: 1, unused: 1, kept: 0, held: 0, retired: 1, shared: 0 });
  kept.dispose();
  held.dispose();
  shared.dispose();
});

test('polished composition products own complete maps only for their requested domains', () => {
  const recipe = normalizeProceduralRecipe({ composition: createShapePreset('rounded-cottage'), detail: 2 });
  for (const domain of ['roof', 'walls', 'facade']) {
    const parts = createWorkshopCompositionParts(recipe, null, [domain]);
    try {
      assert.ok(parts.length > 0);
      assert.ok(parts.length <= 8);
      for (const part of parts) {
        assert.ok(part.geometry.getAttribute('uv'));
        if (['mortar', 'stone', 'wood', 'roof'].includes(part.material.userData.workshopSlot)) {
          assert.ok(part.material.normalMap?.isDataTexture);
          assert.ok(part.material.roughnessMap?.isDataTexture);
        }
      }
    } finally { disposeModelParts(parts); }
  }
});
