import * as THREE from 'three/webgpu';
import { uniform } from 'three/tsl';
import { loadEditorConfig } from '../../../config/loadEditorConfig.js';
import { createStylizedWaterMaterial } from '../../stylized/StylizedWaterMaterial.js';
import { createWaterPatternOrigins } from '../../stylized/WaterPatternOrigins.js';
import { seaSwellPhaseOrigin } from '../../water/SeaSwell.js';
import { configureSea, updateSeaState } from '../../water/seaState.js';

/** Actual water material, frozen depth field and waves, on both renderer backends. */
export async function runSeaSurfFixture(renderer, capture) {
  const config = loadEditorConfig().stylizedSurface;
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#769aaa');
  const camera = new THREE.PerspectiveCamera(55, 640 / 480, 0.1, 500);
  camera.position.set(-45, 14, 90); camera.lookAt(-10, 0, 0); camera.updateMatrixWorld();
  const size = 65, meters = 128, center = [-4226432, 278528];
  const field = new Float32Array(size * size * 4);
  const coverage = new Uint8Array(size * size * 4), flow = new Float32Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const index = (y * size + x) * 4;
    const depth = 0.05 + x / (size - 1) * 10;
    field.set([1, 0, depth, depth * 5], index); coverage.set([0, 0, 255, 255], index);
    flow.set([0.5, 0.5, 0, 0], index);
  }
  const makeTexture = (pixels, type) => {
    const map = new THREE.DataTexture(pixels, size, size, THREE.RGBAFormat, type);
    map.minFilter = map.magFilter = THREE.LinearFilter; map.needsUpdate = true; return map;
  };
  const maps = [makeTexture(field, THREE.FloatType), makeTexture(coverage, THREE.UnsignedByteType), makeTexture(flow, THREE.FloatType)];
  const geometry = new THREE.PlaneGeometry(meters, meters, 64, 64);
  const clock = uniform(127.3), mesh = new THREE.Mesh(geometry); mesh.rotation.x = -Math.PI / 2; scene.add(mesh);
  const owned = [];
  const build = enabled => {
    const settings = structuredClone(config);
    settings.water.refraction.enabled = false; settings.water.caustics.intensity = 0;
    settings.water.rainRipples.enabled = false; settings.water.sea.surf.enabled = enabled;
    settings.water.sea.detail.enabled = enabled;
    configureSea(settings.water.sea);
    const patterns = createWaterPatternOrigins(settings.water); patterns.update(...center);
    const material = createStylizedWaterMaterial({ surfaceMaskTexture: maps[1], waterFieldTexture: maps[0],
      waterFlowTexture: maps[2], waterFieldSize: size, waterSurfaceOrigin: uniform(0),
      chunkCenter: uniform(new THREE.Vector2(...center)), chunkWorldSize: meters, time: clock,
      config: settings, surfacePatterns: patterns, enableRefraction: false,
      seaPhaseOrigin: seaSwellPhaseOrigin(...center).map(phase => uniform(phase)),
      sunDirection: uniform(new THREE.Vector3(-0.4, 0.5, -0.4).normalize()) });
    owned.push(material); return material;
  };
  const draw = async id => {
    await renderer.compileAsync(scene, camera); renderer.render(scene, camera);
    if (renderer.backend.isWebGPUBackend) await renderer.backend.device.queue.onSubmittedWorkDone();
    await capture(id, { calls: renderer.info.render.calls, time: clock.value });
  };
  try {
    updateSeaState({ timeSeconds: clock.value, seaLevel: 0, storm: 0.25, rain: 0 });
    mesh.material = build(false); await draw('surf-off');
    mesh.material = build(true); await draw('surf-on');
    mesh.position.set(-4096, 0, 4096); camera.position.add(mesh.position); camera.updateMatrixWorld();
    await draw('surf-rebased');
    camera.position.sub(mesh.position); mesh.position.set(0, 0, 0); camera.updateMatrixWorld();
    clock.value += 2; await draw('surf-moving');
  } finally {
    owned.forEach(material => material.dispose()); maps.forEach(map => map.dispose()); geometry.dispose(); configureSea(null);
  }
}
