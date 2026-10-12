import * as THREE from 'three';
import { createNoise } from '../math/vfxNoise.js';

const MAX_ANGLE_RAD = THREE.MathUtils.degToRad(2.2);
const MAX_ROLL_RAD = THREE.MathUtils.degToRad(1.6);
const MAX_OFFSET_M = 0.12;
const TRAUMA_DECAY_PER_S = 1.25;
const FREQUENCY_HZ = 18;

/**
 * Trauma-based camera shake (shake = trauma²), driven by smooth noise rather
 * than random jitter. It is applied after the camera controllers have placed
 * the camera for the frame; when a controller leaves the camera untouched,
 * the previous frame's offset is taken back out first so it never builds up.
 */
export function createCameraShake() {
  const noise = createNoise(99);
  const baseQuaternion = new THREE.Quaternion();
  const basePosition = new THREE.Vector3();
  const appliedQuaternion = new THREE.Quaternion();
  const appliedPosition = new THREE.Vector3();
  const offsetEuler = new THREE.Euler();
  const offsetQuaternion = new THREE.Quaternion();
  const offset = new THREE.Vector3();
  let trauma = 0;
  let time = 0;
  let applied = false;

  return {
    /**
     * @param {number} amount 0..1 at the source
     * @param {{x:number,y:number,z:number}} [origin]
     * @param {{x:number,y:number,z:number}} [listener]
     * @param {number} [radius] full strength inside, fading to zero at 4× radius
     */
    add(amount, origin, listener, radius = 10) {
      let scale = 1;
      if (origin && listener) {
        const distance = Math.hypot(origin.x - listener.x, origin.y - listener.y, origin.z - listener.z);
        scale = Math.max(0, 1 - Math.max(0, distance - radius) / (radius * 3));
      }
      trauma = Math.min(1, trauma + amount * scale);
    },
    update(dt, camera) {
      if (applied && camera.quaternion.equals(appliedQuaternion) && camera.position.equals(appliedPosition)) {
        camera.quaternion.copy(baseQuaternion);
        camera.position.copy(basePosition);
      }
      applied = false;
      trauma = Math.max(0, trauma - TRAUMA_DECAY_PER_S * dt);
      time += dt;
      if (trauma <= 0) return;
      const shake = trauma * trauma;
      const t = time * FREQUENCY_HZ;
      baseQuaternion.copy(camera.quaternion);
      basePosition.copy(camera.position);
      offsetEuler.set(
        (noise.noise2(t, 1.3) * 2 - 1) * MAX_ANGLE_RAD * shake,
        (noise.noise2(t, 7.9) * 2 - 1) * MAX_ANGLE_RAD * shake,
        (noise.noise2(t, 13.1) * 2 - 1) * MAX_ROLL_RAD * shake,
        'YXZ',
      );
      offsetQuaternion.setFromEuler(offsetEuler);
      camera.quaternion.multiply(offsetQuaternion);
      offset.set(
        noise.noise2(t, 21.7) * 2 - 1,
        noise.noise2(t, 29.3) * 2 - 1,
        0,
      ).multiplyScalar(MAX_OFFSET_M * shake).applyQuaternion(camera.quaternion);
      camera.position.add(offset);
      camera.updateMatrixWorld();
      appliedQuaternion.copy(camera.quaternion);
      appliedPosition.copy(camera.position);
      applied = true;
    },
    get trauma() {
      return trauma;
    },
  };
}
