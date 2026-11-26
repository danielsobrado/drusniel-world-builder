import { particlePrefix } from '../performance/EnvironmentalParticleBudget.js';
import * as THREE from "three";
import { createSandstormHazeNodeMaterial, createSandstormNodeMaterial } from "./rainNodeMaterial.js";
import {
  createSandstormHazeShaderMaterial,
  createSandstormShaderMaterial
} from "./rainShaderMaterial.js";
import { SANDSTORM_PARTICLE_COUNT } from "./rain_constants.js";
import { DEFAULT_SANDSTORM_WEATHER_SETTINGS } from "./rain_defaults.js";
import { createSandstormGeometry } from "./rain_geometry.js";
import { placeCameraFacingBillboard } from "./weather_camera_billboard.js";
import { applyStormWeatherToMaterials, clampStormWeatherSettings, isWeatherVisible } from "./weather_settings.js";
import { worldWindCamera, worldWindUniforms } from "./wind/worldWindState.js";
const HAZE_DISTANCE = 1.2;
const HAZE_WIDTH_SCALE = 0.56;
const HAZE_HEIGHT_SCALE = 0.56;
/** Bounds of the gust ratio that speeds the dust up or slows it down. */
const GUST_MIN = 0.4;
const GUST_MAX = 2.5;
/**
 * The gust at the camera against the world wind's mean: 1 in the mean wind.
 * The dust's authored speed already scales with the sandstorm's intensity, so
 * only the gust on top of the mean moves it.
 */
function sandstormGust(sample = worldWindCamera, uniforms = worldWindUniforms) {
  const mean = uniforms.prevailingStrength.value / Math.max(uniforms.referenceStrength.value, 1e-4);
  const ratio = sample.envelope / Math.max(mean, 1e-4);
  return Number.isFinite(ratio) ? THREE.MathUtils.clamp(ratio, GUST_MIN, GUST_MAX) : 1;
}
class SandstormWeatherSystem {
  group = new THREE.Group();
  sandMaterial;
  hazeMaterial;
  sandMesh;
  hazeMesh;
  camera;
  center = new THREE.Vector3();
  cameraDirection = new THREE.Vector3();
  settings = { ...DEFAULT_SANDSTORM_WEATHER_SETTINGS };
  /** Seconds of dust travel: the gust integrated, so a gust never jumps a puff. */
  clock = 0;
  constructor(options) {
    this.camera = options.camera;
    this.group.name = "weather-sandstorm";
    this.group.visible = this.settings.enabled;
    this.sandMaterial = options.isWebGpu ? createSandstormNodeMaterial() : createSandstormShaderMaterial();
    this.hazeMaterial = options.isWebGpu ? createSandstormHazeNodeMaterial() : createSandstormHazeShaderMaterial();
    this.sandMesh = new THREE.Mesh(createSandstormGeometry(options.seed ?? 1515017997), this.sandMaterial.material);
    this.sandMesh.name = "weather-sandstorm-puffs";
    this.sandMesh.frustumCulled = false;
    this.sandMesh.renderOrder = 43;
    this.hazeMesh = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 1.3, 1, 1), this.hazeMaterial.material);
    this.hazeMesh.name = "weather-sandstorm-haze";
    this.hazeMesh.frustumCulled = false;
    this.hazeMesh.renderOrder = 98;
    this.group.add(this.sandMesh, this.hazeMesh);
    options.scene.add(this.group);
    this.applySettings(this.settings);
  }
  applySettings(settings) {
    this.settings = clampStormWeatherSettings(settings);
    this.group.visible = isWeatherVisible(this.settings);
    applyStormWeatherToMaterials(this.settings, [this.sandMaterial, this.hazeMaterial]);
  }
  /** The sandstorm channel the ground's sand follows (0 when it is not blowing). */
  get intensity() {
    return this.group.visible ? this.settings.intensity : 0;
  }
  update(deltaSeconds, elapsedSeconds, cameraPosition, particles = null) {
    void elapsedSeconds;
    if (!this.group.visible) return;
    if (particles) this.sandMesh.geometry.instanceCount = particlePrefix(SANDSTORM_PARTICLE_COUNT, particles.request('dust', SANDSTORM_PARTICLE_COUNT));
    // Along the prevailing world wind, not the local field: every puff's place
    // hangs on the direction, and the field's curl would swing the whole cloud.
    const prevailing = worldWindUniforms.prevailing.value;
    this.sandMaterial.setWind(prevailing.x, prevailing.y);
    this.clock += Math.min(0.25, Math.max(0, Number(deltaSeconds) || 0)) * sandstormGust();
    this.center.copy(cameraPosition);
    this.sandMaterial.setCenter(this.center);
    this.sandMaterial.setTime(this.clock);
    this.hazeMaterial.setTime(this.clock);
    placeCameraFacingBillboard({
      camera: this.camera,
      mesh: this.hazeMesh,
      cameraPosition,
      distance: HAZE_DISTANCE,
      widthScale: HAZE_WIDTH_SCALE,
      heightScale: HAZE_HEIGHT_SCALE,
      scratchDirection: this.cameraDirection
    });
  }
  getStats() {
    return { particles: this.group.visible ? this.sandMesh.geometry.instanceCount : 0, haze: this.group.visible };
  }
  dispose() {
    this.group.removeFromParent();
    this.sandMesh.geometry.dispose();
    this.hazeMesh.geometry.dispose();
    this.sandMaterial.dispose();
    this.hazeMaterial.dispose();
  }
}
export {
  SandstormWeatherSystem,
  sandstormGust
};
