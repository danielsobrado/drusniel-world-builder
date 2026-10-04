import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three/webgpu';
import { GODS_END_WORKSHOP_PRESETS } from '../src/editor/workshop/ProceduralWorkshopGodsEndPresets.js';
import { normalizeWorkshopMaterialDocument, serializeWorkshopMaterialDocument } from '../src/editor/workshop/ProceduralWorkshopMaterialConfig.js';
import { applyWorkshopGeneratedMaps } from '../src/editor/workshop/ProceduralWorkshopGeneratedMaps.js';
import { getSurfaceTextures, disposeProceduralSurfaces } from '../src/editor/assets/proceduralSurfaces.js';
import { createProceduralWorkshopComponentParts } from '../src/editor/workshop/ProceduralWorkshopComponentParts.js';
import { disposeModelParts } from '../src/editor/assets/modelParts.js';

test('all donor presets and custom variants survive canonical document round trips', () => {
  assert.equal(Object.keys(GODS_END_WORKSHOP_PRESETS).length, 9);
  const custom = { ...GODS_END_WORKSHOP_PRESETS['gods-end-planks'], id: 'custom-planks', rotation: 90, repeat: 3 };
  const input = {
    materialDefaults: { wood: custom.id },
    materialFavorites: Object.keys(GODS_END_WORKSHOP_PRESETS),
    materialLibrary: { presets: { [custom.id]: custom } },
  };
  const document = normalizeWorkshopMaterialDocument(input);
  assert.equal(document.materialLibrary.presets[custom.id].proceduralSurface, 'planks');
  assert.deepEqual(normalizeWorkshopMaterialDocument(serializeWorkshopMaterialDocument(document)), document);
  assert.throws(() => normalizeWorkshopMaterialDocument({
    ...input, materialLibrary: { presets: { [custom.id]: { ...custom, proceduralSurface: 'unknown' } } },
  }), /Unknown Gods End surface/);
});

test('Workshop texture transforms are independent and teardown preserves shared catalog pixels', () => {
  const preset = GODS_END_WORKSHOP_PRESETS['gods-end-stone'];
  const source = getSurfaceTextures('stoneBlock');
  const a = new THREE.MeshStandardNodeMaterial();
  const b = new THREE.MeshStandardNodeMaterial();
  applyWorkshopGeneratedMaps(a, preset);
  applyWorkshopGeneratedMaps(b, { ...preset, rotation: 90, repeat: 2 });
  assert.notEqual(a.map, b.map);
  assert.equal(a.map.source, source.map.source);
  assert.equal(b.map.rotation, Math.PI / 2);
  assert.equal(a.map.rotation, 0);
  assert.equal(source.map.repeat.x, 1);
  assert.equal(source.map.rotation, 0);
  let disposed = 0;
  let sourceDisposed = 0;
  a.map.addEventListener('dispose', () => { disposed += 1; });
  a.normalMap.addEventListener('dispose', () => { disposed += 1; });
  source.map.addEventListener('dispose', () => { sourceDisposed += 1; });
  a.dispose(); a.dispose();
  assert.equal(disposed, 2);
  assert.equal(sourceDisposed, 0);
  b.dispose();
  disposeProceduralSurfaces();
  assert.equal(sourceDisposed, 1);
});

test('semantic Workshop material defaults actually select donor textures in generated parts', () => {
  const parts = createProceduralWorkshopComponentParts({
    archetype: 'house', style: 'limestone', topStyle: 'slate', finish: 'limewash',
    width: 6, depth: 4, height: 5, seed: 1848, detail: 1,
    materialDefaults: { wood: 'gods-end-planks', roof: 'gods-end-roof-slate' },
  }, { preserveComponents: true });
  try {
    const wood = parts.find((part) => part.material.userData.workshopPresetId === 'gods-end-planks');
    const roof = parts.find((part) => part.material.userData.workshopPresetId === 'gods-end-roof-slate');
    assert.ok(wood, 'door/wood regions use the selected preset');
    assert.ok(roof, 'roof regions use the selected preset');
    assert.equal(wood.material.map.image.width, 256);
    assert.equal(roof.material.map.image.width, 512);
    assert.ok(roof.material.map.name.startsWith('gods-end-roofSlate'));
    assert.equal(roof.material.normalMap.colorSpace, THREE.NoColorSpace);
    assert.equal(roof.material.bumpMap, null);
    assert.equal(roof.material.roughnessMap, null);
  } finally {
    disposeModelParts(parts);
    disposeProceduralSurfaces();
  }
});
