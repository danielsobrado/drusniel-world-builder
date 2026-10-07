import * as THREE from 'three/webgpu';
import { uniform } from 'three/tsl';
import { loadEditorConfig } from '../../../config/loadEditorConfig.js';
import { createTerrainMaterial } from '../../terrainMaterial.js';
import { TERRAIN_SLOT_KEY } from '../../materials/TerrainSlotBindings.js';
import { createCoastPatternOrigins } from '../../stylized/CoastSwashShading.js';
import { configureSea, updateSeaState } from '../../water/seaState.js';

/** Compile and draw the complete shared terrain graph, including its water-slot read. */
export async function runTerrainCoastAppearanceFixture(renderer, capture) {
  const config = structuredClone(loadEditorConfig().stylizedSurface);
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#81a8b4');
  const camera = new THREE.PerspectiveCamera(52, 4 / 3, 0.1, 400);
  camera.position.set(-9, 13, 35); camera.lookAt(12, 0, -7); camera.updateMatrixWorld();
  const width = 32, size = width + 1, meters = 96;
  const height = new Float32Array(size * size);
  const water = new Uint16Array(size * size * 4);
  const mask = new Uint8Array(water.length);
  for (let row = 0; row < size; row++) for (let col = 0; col < size; col++) {
    const index = row * size + col, x = (col / width - 0.5) * meters;
    height[index] = -x * 0.18;
    water[index * 4] = THREE.DataUtils.toHalfFloat(x > 0 ? 1 : 0);
    water[index * 4 + 2] = THREE.DataUtils.toHalfFloat(Math.max(0, x * 0.18));
    mask[index * 4 + 2] = x > 0 ? 255 : 0;
    mask[index * 4 + 3] = 255;
  }
  const maps = [];
  const texture = (data, format, type, textureSize = size) => {
    const map = new THREE.DataTexture(data, textureSize, textureSize, format, type);
    map.minFilter = map.magFilter = THREE.NearestFilter;
    map.needsUpdate = true; maps.push(map); return map;
  };
  const tileTexture = texture(new Uint8Array([214, 190, 150, 255]), THREE.RGBAFormat, THREE.UnsignedByteType, 1);
  tileTexture.colorSpace = THREE.SRGBColorSpace;
  const heightTexture = texture(height, THREE.RedFormat, THREE.FloatType);
  const surfaceMaskTexture = texture(mask, THREE.RGBAFormat, THREE.UnsignedByteType);
  const forestFloorTexture = texture(new Uint8Array(4), THREE.RGBAFormat, THREE.UnsignedByteType, 1);
  const waterFieldTexture = texture(water, THREE.RGBAFormat, THREE.HalfFloatType);
  const chunkCenter = uniform(new THREE.Vector2(-4226432, 278528));
  const coastPatterns = createCoastPatternOrigins(); coastPatterns.update(chunkCenter.value.x, chunkCenter.value.y);
  const inputs = { tileTexture, heightTexture, surfaceMaskTexture, forestFloorTexture, chunkCenter, coastPatterns };
  const materials = [];
  const build = () => {
    const material = createTerrainMaterial({ ...inputs, width, chunkWorldSize: meters, stylizedConfig: config });
    materials.push(material); return material;
  };
  const geometry = new THREE.PlaneGeometry(meters, meters, width, width);
  const mesh = new THREE.Mesh(geometry); mesh.rotation.x = -Math.PI / 2; scene.add(mesh);
  const waterSlot = { waterFieldTexture, surfaceOrigin: uniform(0), hasWaterCoverage: true };
  mesh.userData[TERRAIN_SLOT_KEY] = { ...inputs, waterSlot };
  scene.add(new THREE.HemisphereLight('#d9edff', '#716046', 2.3));
  const sun = new THREE.DirectionalLight('#fff2d8', 2.2); sun.position.set(-20, 50, 35); scene.add(sun, sun.target);
  const draw = async id => {
    await renderer.compileAsync(scene, camera); renderer.render(scene, camera);
    if (renderer.backend.isWebGPUBackend) await renderer.backend.device.queue.onSubmittedWorkDone();
    await capture(id);
  };
  try {
    configureSea(config.water.sea); updateSeaState({ timeSeconds: 12.3, seaLevel: 0, storm: 0, rain: 0 });
    if (renderer.backend.isWebGPUBackend) {
      mesh.material = build();
      await draw('terrain-full-coast'); waterSlot.surfaceOrigin.value = 4;
      await draw('terrain-full-inland'); waterSlot.surfaceOrigin.value = 0;
    }
    // WebGL has 16 texture units, below the complete terrain bake graph's
    // existing budget. Compare the production fallback and coast graph on both.
    config.materialBake.enabled = false; mesh.material = build();
    await draw('terrain-coast');
    waterSlot.surfaceOrigin.value = 4;
    await draw('terrain-inland');
  } finally {
    materials.forEach(material => material.dispose()); geometry.dispose(); maps.forEach(map => map.dispose()); configureSea(null);
  }
}
