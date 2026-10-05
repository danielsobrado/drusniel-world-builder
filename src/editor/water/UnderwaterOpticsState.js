import * as THREE from 'three/webgpu';
import { uniform } from 'three/tsl';
import { wavePatternOrigin, wrapPeriodic } from '../stylized/PatternOrigins.js';
import { UNDERWATER_RIPPLE_WAVES } from './GodsEndWaterPatterns.js';
import { resolveUnderwaterOpticsConfig } from './UnderwaterOpticsConfig.js';
import { WATER_KIND_OCEAN } from './WaterConstants.js';

/** CPU-owned camera, sunlight and wrapped canonical pattern phases. */
export class UnderwaterOpticsState {
  constructor({ settings, scene, floatingOrigin = null }) {
    this.settings = resolveUnderwaterOpticsConfig(settings);
    this.scene = scene;
    this.floatingOrigin = floatingOrigin;
    this.eye = uniform(new THREE.Vector3());
    this.depth = uniform(0);
    this.color = uniform(new THREE.Vector3());
    this.sun = uniform(1);
    this.sunDirection = uniform(new THREE.Vector3(0, 1, 0));
    this.beamU = uniform(new THREE.Vector3(1, 0, 0));
    this.beamV = uniform(new THREE.Vector3(0, 0, 1));
    this.projection = uniform(new THREE.Matrix4());
    this.worldInverse = uniform(new THREE.Matrix4());
    this.near = uniform(0.1);
    this.far = uniform(5000);
    this.causticOffset = uniform(new THREE.Vector2());
    this.ripplePhases = UNDERWATER_RIPPLE_WAVES.map(() => uniform(0));
    this.waterKind = null;
    this.direction = new THREE.Vector3();
  }

  update({ waterKind } = {}) {
    if (waterKind !== undefined) this.waterKind = waterKind;
  }

  updateCamera(camera, surfaceHeight) {
    camera.getWorldPosition(this.eye.value);
    this.depth.value = Math.max(0, surfaceHeight - this.eye.value.y);
    this.projection.value.copy(camera.projectionMatrix);
    this.worldInverse.value.copy(camera.matrixWorldInverse);
    this.near.value = camera.near;
    this.far.value = camera.far;
    // Original sea/inland scattering colours in linear light.
    const tint = this.waterKind === WATER_KIND_OCEAN ? [0.03, 0.24, 0.32] : [0.05, 0.26, 0.24];
    this.color.value.set(...tint);
    for (const [index, key] of ['x', 'y', 'z'].entries()) {
      this.color.value[key] *= Math.exp(-this.settings.dimming[index] * this.depth.value);
    }
    const light = this.scene.children.find(child => child.isDirectionalLight && !child.userData.fallbackLighting);
    if (light) {
      this.direction.copy(light.position).sub(light.target.position).normalize();
      const horizontal = Math.hypot(this.direction.x, this.direction.z) / 1.333;
      this.sunDirection.value.set(this.direction.x / 1.333, Math.sqrt(Math.max(1 - horizontal * horizontal, 0)), this.direction.z / 1.333).normalize();
      this.sun.value = THREE.MathUtils.clamp(this.direction.y * light.intensity, 0, 1);
    } else this.sun.value = 0;
    this.beamU.value.set(0, 0, 1).cross(this.sunDirection.value).normalize();
    this.beamV.value.crossVectors(this.sunDirection.value, this.beamU.value).normalize();
    const origin = this.floatingOrigin?.getState() ?? { x: 0, z: 0 };
    this.causticOffset.value.set(wrapPeriodic(origin.x, this.settings.causticTileMeters), wrapPeriodic(origin.z, this.settings.causticTileMeters));
    UNDERWATER_RIPPLE_WAVES.forEach(([x, z], i) => {
      this.ripplePhases[i].value = wavePatternOrigin(origin.x, origin.z, x, z);
    });
  }
}
