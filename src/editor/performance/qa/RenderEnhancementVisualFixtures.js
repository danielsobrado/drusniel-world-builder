import * as THREE from 'three/webgpu';
import { cameraPosition, float, normalView, normalWorld, normalize, positionWorld, smoothstep, uniform, uv, vec3 } from 'three/tsl';
import { createSnowDetailNodes } from '../../stylized/SnowDetailShading.js';
import { acquireSnowTextures } from '../../assets/godsEnd/snowTextures.js';
import { WaterReflectionController } from '../../../render/reflections/WaterReflectionController.js';
import { CascadedSunShadows } from '../../../render/shadows/CascadedSunShadows.js';

/** Fixed geometry, sun, time and poses. Exercises actual shaders and owned captures. */
export async function runRenderEnhancementVisualFixtures(renderer, capture) {
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#839eb7');
  const camera = new THREE.PerspectiveCamera(60, 1280 / 720, 0.1, 200);
  camera.position.set(8, 6, 13); camera.lookAt(0, 1, 0); camera.updateMatrixWorld();
  const sun = new THREE.DirectionalLight(0xffffff, 3); sun.position.set(-10, 25, 10);
  sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024); sun.shadow.bias = -0.0002;
  scene.add(sun, sun.target, new THREE.HemisphereLight(0xd5e6ff, 0x5b697b, 2));
  renderer.shadowMap.enabled = true;
  const cascades = new CascadedSunShadows(sun, 80);
  const maps = acquireSnowTextures();
  await new Promise((resolve, reject) => {
    const deadline = performance.now() + 15000;
    const poll = () => maps.ready.value ? resolve() : performance.now() > deadline ? reject(new Error('Snow fixture textures failed to load.')) : setTimeout(poll, 20);
    poll();
  });
  const material = new THREE.MeshStandardNodeMaterial({ color: '#e0efff', roughness: 0.9 });
  const center = uniform(new THREE.Vector2());
  const snow = createSnowDetailNodes({ terrainUv: uv(), chunkWorldSize: 32, chunkCenter: center,
    snow: float(1), material, groundHeight: positionWorld.y,
    pathMask: smoothstep(0.025, 0.035, uv().x.sub(0.5).abs()).oneMinus(), baseNormal: normalView, reliefEnabled: true });
  material.colorNode = snow.color(vec3(0.72, 0.82, 0.95));
  material.normalNode = snow.normal(normalView); material.roughnessNode = snow.roughness(float(0.9));
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(32, 32, 1, 1), material);
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  const slope = new THREE.Mesh(new THREE.BoxGeometry(6, 3, 7), material);
  slope.position.set(-7, 1.5, -5); slope.rotation.z = 0.4; slope.castShadow = slope.receiveShadow = true; scene.add(slope);
  const block = new THREE.Mesh(new THREE.BoxGeometry(2, 5, 2), new THREE.MeshStandardNodeMaterial({ color: '#cb3d20' }));
  block.position.set(-3, 2.5, -1); block.castShadow = true; scene.add(block);
  let origin = { x: 0, z: 0 };
  const water = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), new THREE.MeshBasicNodeMaterial());
  water.rotation.x = -Math.PI / 2; water.position.set(1, 0.04, 2); scene.add(water);
  const view = { scene, renderer, floatingOrigin: { getState: () => origin }, worldStore: { generator: {}, revision: 0 }, chunkWorldSize: 32,
    getCanonicalWater: () => ({ kind: 2, coverage: 1, surfaceHeight: 0.04 }) };
  const reflections = new WaterReflectionController(view, { resolution: 128, intervalMs: 100, reachMeters: 96, planar: true });
  water.material.colorNode = reflections.sample(normalize(positionWorld.sub(cameraPosition)).reflect(normalWorld), vec3(0.08, 0.16, 0.25));
  const surface = { waterSlots: [{ mesh: water, hasWaterCoverage: true, terrainSlot: { descriptor: { centerWorldX: 0, centerWorldZ: 0 } } }], detailViews: [] };
  const draw = async () => { cascades.prepare(camera); renderer.render(scene, camera); await renderer.backend.device.queue.onSubmittedWorkDone(); };
  const stats = () => ({ cubeValid: reflections.valid.value, planarValid: reflections.planarValid.value,
    cascades: cascades.node.cascades, textures: renderer.info.memory.textures, geometries: renderer.info.memory.geometries,
    calls: renderer.info.render.calls, triangles: renderer.info.render.triangles });
  try {
    await draw();
    reflections.prewarm(camera, surface); await draw();
    if (!reflections.valid.value || !reflections.planarValid.value) throw new Error('Flat-water fixture did not publish both captures.');
    await capture('snow-water-cascades', stats());
    camera.position.set(-4, 3, 9); camera.lookAt(-2, 0, 1); camera.updateMatrixWorld();
    await draw(); reflections.invalidate(); reflections.prewarm(camera, surface); await draw();
    await capture('low-water-pose', stats());
    sun.color.set('#859ace'); sun.intensity = 0.08;
    await draw(); reflections.invalidate(); reflections.prewarm(camera, surface); await draw();
    await capture('night-captures', stats());
    origin = { x: 4096, z: -4096 };
    // Hemisphere-light position expresses a direction, not a world anchor.
    for (const child of scene.children) {
      if (!child.isHemisphereLight) child.position.add(new THREE.Vector3(-origin.x, 0, -origin.z));
    }
    camera.position.add(new THREE.Vector3(-origin.x, 0, -origin.z)); camera.updateMatrixWorld();
    await draw(); reflections.invalidate(); reflections.prewarm(camera, surface); await draw();
    if (!reflections.planarValid.value) throw new Error('Rebase did not refresh the planar capture.');
    await capture('rebased-captures', stats());
    const validBefore = reflections.valid.value;
    view.worldStore.revision++; reflections.update(camera, surface, 0);
    if (validBefore !== 1 || reflections.valid.value !== 0) throw new Error('World edits did not invalidate a published probe.');
  } finally {
    maps.release(); cascades.dispose(); reflections.dispose();
    scene.traverse(object => { object.geometry?.dispose(); if (object.material && object.material !== material) object.material.dispose(); });
    material.dispose();
  }
}
