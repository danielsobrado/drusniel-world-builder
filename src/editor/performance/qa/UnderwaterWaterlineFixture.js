import * as THREE from 'three/webgpu';
import { uniform } from 'three/tsl';
import { loadEditorConfig } from '../../../config/loadEditorConfig.js';
import { UnderwaterCausticsPostProcess } from '../../water/UnderwaterCausticsPostProcess.js';

/** Actual optical depth reconstruction with wet bed, dry geometry and sky. */
export async function runUnderwaterWaterlineFixture(renderer, capture) {
  const config = loadEditorConfig();
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#8fb9df');
  const camera = new THREE.PerspectiveCamera(68, 4 / 3, 0.1, 200);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(180, 180),
    new THREE.MeshBasicNodeMaterial({ color: '#d8c29a', side: THREE.DoubleSide }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -3; scene.add(ground);
  const dry = new THREE.Mesh(new THREE.BoxGeometry(3, 3, 2),
    new THREE.MeshBasicNodeMaterial({ color: '#ce9466' }));
  dry.position.set(-3, 1.5, -10); scene.add(dry);
  const origin = { x: 0, z: 0 };
  const effect = new UnderwaterCausticsPostProcess({ renderer, scene,
    config: config.stylizedSurface.water.projectedCaustics, clock: uniform(12.3),
    optics: { ...config.player.water.underwater.optics, distortion: 0, causticStrength: 0, shaftStrength: 0 },
    floatingOrigin: { getState: () => origin }, waterlineRange: 0.75 });
  const draw = async (id, { enabled = true, level = 0, kind = 1 } = {}) => {
    camera.updateMatrixWorld();
    effect.update({ blend: 0, surfaceHeight: level, waterKind: kind, waterlineEnabled: enabled });
    const optical = effect.render(camera);
    if (!optical) renderer.render(scene, camera);
    if (renderer.backend.isWebGPUBackend) await renderer.backend.device.queue.onSubmittedWorkDone();
    await capture(id, { ...effect.getStatus(), optical, eyeY: camera.position.y, surfaceHeight: level });
  };
  try {
    for (const [id, eyeY] of [['above', 0.04], ['below', -0.04]]) {
      camera.position.set(0, eyeY, 0); camera.lookAt(0, eyeY, -10);
      await draw(`waterline-${id}-off`, { enabled: false });
      await draw(`waterline-${id}`);
    }
    scene.position.y = 6; camera.position.y = 6.04;
    await draw('waterline-lake', { level: 6, kind: 2 });
    const offset = new THREE.Vector3(-4096, 0, 4096);
    scene.position.add(offset); camera.position.add(offset);
    origin.x -= offset.x; origin.z -= offset.z;
    await draw('waterline-lake-rebased', { level: 6, kind: 2 });
    await draw('waterline-dry', { enabled: false, level: 6, kind: 2 });
    camera.position.y = 8;
    await draw('waterline-far-off', { enabled: false, level: 6, kind: 2 });
    await draw('waterline-far', { level: 6, kind: 2 });
  } finally {
    effect.dispose(); ground.geometry.dispose(); ground.material.dispose();
    dry.geometry.dispose(); dry.material.dispose();
  }
}
