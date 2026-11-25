import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import yaml from 'js-yaml';
import * as THREE from 'three/webgpu';
import { uniform, vec3 } from 'three/tsl';
import { FOREST_FLOOR_FILL, foliageSkyFill, syncFoliageLight } from '../src/editor/stylized/forest/foliageLight.js';
import {
  WorldSurfaceContextField,
  clearWorldSurfaceContext,
  sampleWorldSurfaceContextCpu,
} from '../src/editor/stylized/worldSurfaceContext/WorldSurfaceContextField.js';
import { resolveTerrainWorldNoiseMean } from '../src/editor/stylized/worldSurfaceContext/TerrainSurfaceEvaluator.js';
import { createTerrainMaterialBakeConfig } from '../src/editor/materials/TerrainMaterialBakeConfig.js';
import { createMeadowBladeMaterial } from '../src/editor/stylized/meadow/meadowBladeMaterial.js';
import { createMeadowCardMaterial } from '../src/editor/stylized/meadow/meadowCardMaterial.js';
import { createMeadowUniforms } from '../src/editor/stylized/meadow/meadowUniforms.js';
import { resolveMeadowGrassConfig } from '../src/editor/stylized/meadow/meadowGrassConfig.js';
import { createMeadowTemplate } from '../src/editor/stylized/meadow/meadowGrassGeometry.js';
import { GrassTuning } from '../src/editor/stylized/GrassTuning.js';
import { buildShader } from '../test/helpers/buildShader.js';
import { evaluateShaderNode as evaluate } from '../test/helpers/evaluateShaderNode.js';

function loadStylizedConfig() {
  const editorCfg = yaml.load(readFileSync(new URL('../editor.config.yaml', import.meta.url), 'utf8'));
  const bakeCfg = yaml.load(readFileSync(new URL('../config/terrain-material-bake.yaml', import.meta.url), 'utf8'));
  return {
    ...editorCfg.stylizedSurface,
    materialBake: createTerrainMaterialBakeConfig(bakeCfg),
  };
}

test('PR 3 shared FOREST_FLOOR_FILL is symmetric between terrain and grass and world-noise mean stays bounded', () => {
  assert.ok(FOREST_FLOOR_FILL > 0.3 && FOREST_FLOOR_FILL < 0.8);
  const hemisphere = new THREE.HemisphereLight('#bfd4ee', '#3a4628', 0.9);
  syncFoliageLight({ hemisphere });
  const albedo = [0.12, 0.16, 0.06];
  const fillRgb = evaluate(foliageSkyFill(vec3(...albedo), FOREST_FLOOR_FILL));
  assert.ok(fillRgb[1] > fillRgb[0] && fillRgb[0] > fillRgb[2]);

  const stylized = loadStylizedConfig();
  const wnMean = resolveTerrainWorldNoiseMean(stylized);
  for (const ch of wnMean) {
    assert.ok(ch > 0.5 && ch < 0.9, `expected bounded world-noise mean multiplier, got ${wnMean}`);
  }
  assert.deepEqual(resolveTerrainWorldNoiseMean({}), [1, 1, 1]);
});

test('PR 3 WSC eco.a publishes ecological vegetation coverage attenuated by forest canopy and paths', () => {
  clearWorldSurfaceContext();
  const stylized = loadStylizedConfig();
  const chunkSize = 16;
  const tileSize = 2; // 32 m chunk: x in [0, 32), z in (-32, 0]
  const heights = new Float32Array((chunkSize + 1) * (chunkSize + 1)).fill(12);
  const tiles = new Uint8Array(chunkSize * chunkSize).fill(8); // temperate rainforest (grassCoreDensity = 0.09)
  const tilePixels = new Uint8Array(chunkSize * chunkSize * 4);
  const surfaceMaskPixels = new Uint8Array(chunkSize * chunkSize * 4);
  const forestFloorPixels = new Uint8Array(chunkSize * chunkSize * 4);

  for (let z = 0; z < chunkSize; z += 1) {
    for (let x = 0; x < chunkSize; x += 1) {
      const o = (z * chunkSize + x) * 4;
      tilePixels[o] = 72;
      tilePixels[o + 1] = 132;
      tilePixels[o + 2] = 64;
      tilePixels[o + 3] = 8;
      // Raw surfaceMask.g = 1 everywhere, path = 1 on far right (x >= 12).
      surfaceMaskPixels[o] = x >= 12 ? 255 : 0;
      surfaceMaskPixels[o + 1] = 255;
      surfaceMaskPixels[o + 2] = 0;
      surfaceMaskPixels[o + 3] = 255;
      // Open glade on left (x < 6), closed forest canopy in middle (6 <= x < 12).
      forestFloorPixels[o] = (x >= 6 && x < 12) ? 255 : 0;
      forestFloorPixels[o + 1] = 0;
      forestFloorPixels[o + 2] = (x >= 6 && x < 12) ? 200 : 0;
      forestFloorPixels[o + 3] = 255;
    }
  }

  const slot = {
    descriptor: { key: '0:0', chunkX: 0, chunkZ: 0, originCellX: 0, originCellZ: 0 },
    page: { heights, tiles, tilePixels, surfaceMaskPixels },
    forestFloorPixels,
    forestFloorSize: chunkSize,
    forestFloorKey: 'ff-pr3',
    pageRevision: 1,
    loading: false,
  };
  const field = new WorldSurfaceContextField({
    terrainView: { worldStore: { chunkSize, tileSize }, slots: [slot] },
    config: stylized,
  });
  try {
    assert.equal(field.update({ x: 16, z: -16 }, { x: 0, z: 0 }), true);
    const glade = sampleWorldSurfaceContextCpu(6, -16);
    const closedCanopy = sampleWorldSurfaceContextCpu(18, -16);
    const road = sampleWorldSurfaceContextCpu(28, -16);

    assert.ok(glade.vegetationCoverage > 0.95, `expected full grass coverage in open glade, got ${glade.vegetationCoverage}`);
    assert.ok(
      closedCanopy.vegetationCoverage > 0.05 && closedCanopy.vegetationCoverage < 0.2,
      `expected canopy-suppressed grass coverage (~0.09) in rainforest core, got ${closedCanopy.vegetationCoverage}`,
    );
    assert.ok(road.vegetationCoverage < 0.05, `expected zero grass coverage on road, got ${road.vegetationCoverage}`);
  } finally {
    field.dispose();
  }
});

test('PR 3 near blade and far card materials compile cleanly to WGSL with WSC textureLoad and shared canopy fill', () => {
  const stylized = loadStylizedConfig();
  const meadowSettings = resolveMeadowGrassConfig(stylized.grass.meadow);
  const uniforms = createMeadowUniforms(meadowSettings);
  const tuning = new GrassTuning(stylized);
  const sunDirection = uniform(new THREE.Vector3(0.4, 0.8, 0.3));

  // 1. Near blade material WGSL compilation.
  const bladeMat = createMeadowBladeMaterial({
    uniforms,
    tuning: tuning.uniforms,
    config: stylized,
    sunDirection,
    bandCount: 3,
    handoff: true,
    tileSize: meadowSettings.tileSize,
  });
  const bladeTemplate = createMeadowTemplate({ detail: 3, count: 4, tileSize: 8, lodDetails: [2, 1], lodIndex: 0 });
  const bladeGeo = new THREE.InstancedBufferGeometry();
  for (const name of ['position', 'uv', 'bladeProfile', 'instancePosition', 'instanceRotation', 'instanceData']) {
    bladeGeo.setAttribute(name, bladeTemplate.getAttribute(name));
  }
  bladeGeo.setAttribute('instanceTile', new THREE.InstancedBufferAttribute(new Float32Array(16), 4));
  bladeGeo.index = bladeTemplate.index;
  bladeGeo.instanceCount = 4;
  const bladeShader = buildShader(new THREE.Mesh(bladeGeo, bladeMat));
  assert.ok(bladeShader.vertexShader.includes('textureLoad'));
  assert.ok(bladeShader.fragmentShader.length > 0);

  // 2. Far card material WGSL compilation.
  const cardAtlas = new THREE.DataTexture(new Uint8Array(16), 2, 2, THREE.RGBAFormat);
  cardAtlas.needsUpdate = true;
  const cardMat = createMeadowCardMaterial({
    uniforms,
    tuning: tuning.uniforms,
    config: stylized,
    sunDirection,
    atlas: cardAtlas,
  });
  const cardTemplate = createMeadowTemplate({ detail: 1, count: 4, tileSize: 64, cards: true });
  const cardGeo = new THREE.InstancedBufferGeometry();
  for (const name of ['position', 'uv', 'instancePosition', 'instanceRotation', 'instanceData']) {
    if (cardTemplate.getAttribute(name)) cardGeo.setAttribute(name, cardTemplate.getAttribute(name));
  }
  cardGeo.setAttribute('instanceTile', new THREE.InstancedBufferAttribute(new Float32Array(16), 4));
  cardGeo.index = cardTemplate.index;
  cardGeo.instanceCount = 4;
  const cardShader = buildShader(new THREE.Mesh(cardGeo, cardMat));
  assert.ok(cardShader.vertexShader.includes('textureLoad'));
  assert.ok(cardShader.fragmentShader.length > 0);
});
