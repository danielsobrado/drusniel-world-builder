import * as THREE from 'three/webgpu';
import { uniform } from 'three/tsl';
import { wavePatternOrigin, wrapPeriodic } from '../stylized/PatternOrigins.js';
import { UNDERWATER_RIPPLE_WAVES } from './GodsEndWaterPatterns.js';
import { resolveUnderwaterOpticsConfig } from './UnderwaterOpticsConfig.js';
import { WATER_KIND_OCEAN } from './WaterConstants.js';
import { resolveSeaOptics, seaOpticsMode } from './SeaOptics.js';
import { seaStateUniforms } from './seaState.js';

const VECTOR_AXES = Object.freeze(['x', 'y', 'z']);
const COLOR_AXES = Object.freeze(['r', 'g', 'b']);

/** CPU-owned camera, sunlight and wrapped canonical pattern phases. */
export class UnderwaterOpticsState {
  constructor({ settings, scene, floatingOrigin = null, seaOptics = {}, waterQuality = 'high' }) {
    this.settings = resolveUnderwaterOpticsConfig(settings);
    this.seaSettings = resolveSeaOptics(seaOptics);
    this.seaMode = seaOpticsMode(this.seaSettings, waterQuality);
    this.sunnyLagoon = new THREE.Color(this.seaSettings.sunny.lagoon);
    this.stormLagoon = new THREE.Color(this.seaSettings.storm.lagoon);
    this.sunnyShallow = new THREE.Color(this.seaSettings.sunny.shallow);
    this.stormShallow = new THREE.Color(this.seaSettings.storm.shallow);
    this.currentLagoon = new THREE.Color();
    this.currentShallow = new THREE.Color();
    this.scene = scene;
    this.floatingOrigin = floatingOrigin;
    this.eye = uniform(new THREE.Vector3());
    this.depth = uniform(0);
    this.color = uniform(new THREE.Vector3());
    this.oceanWeight = uniform(0);
    this.seaExtinction = uniform(new THREE.Vector3());
    this.seaAbsorption = uniform(new THREE.Vector3());
    this.seaScatteringRatio = uniform(new THREE.Vector3());
    this.seaSource = uniform(new THREE.Vector3());
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
    this.oceanWeight.value = this.waterKind === WATER_KIND_OCEAN && this.seaMode !== 'legacy' ? 1 : 0;
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
    const storm = THREE.MathUtils.clamp(seaStateUniforms.storm.value, 0, 1);
    const turbidity = 1 + storm * (this.seaSettings.scattering.stormTurbidityMultiplier - 1);
    this.currentLagoon.copy(this.sunnyLagoon).lerp(this.stormLagoon, storm);
    this.currentShallow.copy(this.sunnyShallow).lerp(this.stormShallow, storm);
    for (let i = 0; i < 3; i++) {
      const axis = VECTOR_AXES[i];
      const absorb = this.seaSettings.absorptionCoefficients[i];
      const scatter = this.seaMode === 'absorption' || this.seaMode === 'legacy'
        ? 0 : this.seaSettings.scatteringCoefficients[i] * turbidity;
      const extinct = absorb + scatter;
      this.seaAbsorption.value[axis] = absorb;
      this.seaExtinction.value[axis] = extinct;
      this.seaScatteringRatio.value[axis] = scatter / Math.max(extinct, 1e-4);
      this.seaSource.value[axis] = (
        this.currentLagoon[COLOR_AXES[i]] * this.seaSettings.scattering.ambientStrength
        + this.currentShallow[COLOR_AXES[i]] * this.seaSettings.scattering.sunlightStrength * this.sun.value
      ) * (1 - storm * 0.2);
    }
    this.beamU.value.set(0, 0, 1).cross(this.sunDirection.value).normalize();
    this.beamV.value.crossVectors(this.sunDirection.value, this.beamU.value).normalize();
    const origin = this.floatingOrigin?.getState() ?? { x: 0, z: 0 };
    this.causticOffset.value.set(wrapPeriodic(origin.x, this.settings.causticTileMeters), wrapPeriodic(origin.z, this.settings.causticTileMeters));
    UNDERWATER_RIPPLE_WAVES.forEach(([x, z], i) => {
      this.ripplePhases[i].value = wavePatternOrigin(origin.x, origin.z, x, z);
    });
  }
}
