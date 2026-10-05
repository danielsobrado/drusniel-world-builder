import * as THREE from 'three/webgpu';
import { cameraPosition, mix, normalWorld, normalize, positionWorld, uv, vec3 } from 'three/tsl';
import { WaterReflectionController } from '../../../render/reflections/WaterReflectionController.js';

/** Distant reflected content exposes cached-camera translation and turn errors. */
export async function runReflectionReprojectionFixture(renderer, capture) {
  const scene = new THREE.Scene();
  const panorama = new THREE.Mesh(new THREE.SphereGeometry(5000, 64, 32), new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide }));
  panorama.material.colorNode = mix(vec3(0.04, 0.18, 0.4), vec3(0.8, 0.28, 0.06), uv().x.mul(24).sin().mul(0.5).add(0.5));
  scene.add(panorama);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), new THREE.MeshBasicNodeMaterial());
  water.rotation.x = -Math.PI / 2; scene.add(water);
  const camera = new THREE.PerspectiveCamera(60, 4 / 3, 0.1, 10000);
  camera.position.set(0, 12, 20); camera.lookAt(0, 0, -20); camera.updateMatrixWorld();
  let origin = { x: 0, z: 0 };
  const view = { scene, renderer, worldStore: { generator: {}, revision: 0 }, chunkWorldSize: 32,
    floatingOrigin: { getState: () => origin }, getCanonicalWater: () => ({ kind: 2, coverage: 1, surfaceHeight: 0 }) };
  const surface = { waterSlots: [{ mesh: water, hasWaterCoverage: true,
    terrainSlot: { descriptor: { centerWorldX: 0, centerWorldZ: 0 } } }], detailViews: [] };
  const reflections = new WaterReflectionController(view, { resolution: 256, intervalMs: 100, reachMeters: 96, planar: true });
  water.material.colorNode = reflections.sample(normalize(positionWorld.sub(cameraPosition)).reflect(normalWorld), vec3(0.004));
  const draw = async activeCamera => {
    renderer.render(scene, activeCamera);
    if (renderer.backend.isWebGPUBackend) await renderer.backend.device.queue.onSubmittedWorkDone();
  };
  const snapshot = async (id, activeCamera = camera) => {
    await draw(activeCamera);
    await capture(id, { planarValid: reflections.planarValid.value, perspective: reflections.reprojection.perspective.value });
  };
  try {
    await draw(camera); // Publish the renderer's coordinate system before mirroring.
    reflections.prewarm(camera, surface);
    const matrix = reflections.planarMatrix.value.toArray();
    camera.position.x += 8; camera.rotateY(8 * Math.PI / 180); camera.updateMatrixWorld();
    await snapshot('reflection-cached-turn');
    if (matrix.some((value, i) => value !== reflections.planarMatrix.value.elements[i])) throw new Error('Cached reflection unexpectedly refreshed.');
    reflections.invalidate(); reflections.prewarm(camera, surface);
    await snapshot('reflection-refreshed-turn');
    origin = { x: 4096, z: -8192 };
    for (const child of scene.children) child.position.add(new THREE.Vector3(-origin.x, 0, -origin.z));
    camera.position.add(new THREE.Vector3(-origin.x, 0, -origin.z)); camera.updateMatrixWorld();
    reflections.invalidate(); reflections.prewarm(camera, surface);
    await snapshot('reflection-rebased');
    const ortho = new THREE.OrthographicCamera(-25, 25, 18.75, -18.75, 0.1, 10000);
    ortho.position.copy(camera.position); ortho.quaternion.copy(camera.quaternion); ortho.updateMatrixWorld();
    await draw(ortho); reflections.invalidate(); reflections.prewarm(ortho, surface);
    if (reflections.reprojection.perspective.value !== 0) throw new Error('Orbit capture did not select positional projection.');
    await snapshot('reflection-orbit-on', ortho);
    reflections.valid.value = 0; reflections.planarValid.value = 0;
    await snapshot('reflection-orbit-off', ortho);
  } finally {
    reflections.dispose();
    scene.traverse(object => { object.geometry?.dispose(); object.material?.dispose(); });
  }
}
