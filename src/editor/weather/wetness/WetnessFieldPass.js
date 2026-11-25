/**
 * Renders the ground wetness field (wetnessField.js) around the camera: one
 * 128² full-screen pass, only when its inputs change and never more often than
 * `intervalSeconds`, so dry or settled weather costs no GPU work at all.
 *
 * Inputs: the terrain height (a LocalGroundHeight patch, built on the CPU under
 * the deferred-work budget), the ground clocks SurfaceWetness keeps from the
 * storm's rain and the sun, the sun's direction, and two layers of the CC0
 * world-noise array. The noise is placed through a double-precision window
 * origin (PatternOrigins), so it stays exact at planet-scale coordinates.
 * Nothing is read back: the field is visual only.
 */

import * as THREE from 'three/webgpu';
import { float, ivec2, max, normalize, textureLoad, uniform, uv, vec2, vec3, vec4 } from 'three/tsl';
import { LocalGroundHeight } from '../../stylized/ambient/LocalGroundHeight.js';
import { SettlementSamplingPreparation } from '../../world/settlements/SettlementSamplingPreparation.js';
import { PatternOrigins } from '../../stylized/PatternOrigins.js';
import { worldNoiseField } from '../../stylized/worldNoise.js';
import { WORLD_NOISE_LAYERS, WORLD_NOISE_METERS } from '../../stylized/worldNoiseLayout.js';
import { groundWetnessClocksUniform } from '../surfaceWetness.js';
import { WETNESS_FIELD_METRES, WETNESS_FIELD_SIZE, wetnessFieldTarget, wetnessFieldUniforms } from './wetnessField.js';
import { wetnessTexel } from './wetnessFieldModel.js';

const SIZE = WETNESS_FIELD_SIZE;
const STEP = WETNESS_FIELD_METRES / (SIZE - 1);
/** Texels out to the ring a hollow is measured against (~6 m). */
const HOLLOW_RING = 3;
/** Clock or sun change that is worth a new render: half an 8-bit step. */
const CHANGE = 0.5 / 255;

/**
 * Whether the field must be drawn again.
 * @param {object} last what the last render used (null before the first)
 * @param {object} now  `{ clocks: number[], sun: number[], window: number }`
 * @param {number} sinceSeconds since the last render
 * @param {number} intervalSeconds cadence cap while the clocks move
 */
export function wetnessFieldNeedsRender(last, now, sinceSeconds, intervalSeconds) {
  const dry = now.clocks.every((value) => value === 0);
  if (!last) return !dry;
  if (dry && last.clocks.every((value) => value === 0)) return false;
  if (now.window !== last.window) return true;
  if (sinceSeconds < intervalSeconds) return false;
  const moved = (a, b) => a.some((value, i) => Math.abs(value - b[i]) > CHANGE);
  return moved(now.clocks, last.clocks) || moved(now.sun, last.sun);
}

export class WetnessFieldPass {
  /**
   * @param {object} options
   * @param {(x: number, z: number) => number} options.getHeight canonical metres
   * @param {Function} [options.prepareBounds] LocalGroundHeight's ground-readiness gate
   * @param {() => unknown} [options.getRevision] terrain revision
   * @param {Node} options.sunDirection vec3 uniform toward the sun
   * @param {{ intervalSeconds: number }} options.config resolved `wetness.field`
   */
  constructor({ getHeight, prepareBounds, getRevision, sunDirection, config }) {
    this.config = config;
    this.ground = new LocalGroundHeight({ getHeight, prepareBounds, getRevision, resolution: SIZE, extent: WETNESS_FIELD_METRES });
    this.origins = new PatternOrigins({
      patches: { scale: 1 / WORLD_NOISE_METERS.macro, period: 1 },
      mottle: { scale: 1 / WORLD_NOISE_METERS.meso, period: 1 },
    });
    this.last = null;
    this.lastRenderSeconds = -Infinity;
    this.renderedCenter = null;
    this.renders = 0;
    this.force = false;

    const pixel = ivec2(uv().mul(SIZE).floor());
    const height = (dx, dz) => textureLoad(this.ground.texture,
      ivec2(pixel.x.add(dx).clamp(0, SIZE - 1), pixel.y.add(dz).clamp(0, SIZE - 1))).r;
    const here = height(0, 0);
    const gradient = vec2(height(1, 0).sub(height(-1, 0)), height(0, 1).sub(height(0, -1))).div(2 * STEP);
    const ring = HOLLOW_RING;
    const around = [[ring, 0], [-ring, 0], [0, ring], [0, -ring], [ring, ring], [-ring, ring], [ring, -ring], [-ring, -ring]]
      .reduce((sum, [dx, dz]) => sum.add(height(dx, dz)), float(0)).div(8);
    const normal = normalize(vec3(gradient.x.negate(), 1, gradient.y.negate()));
    const sun = normalize(sunDirection);
    // Metres from the window centre (texel (SIZE-1)/2), canonical axes.
    const localMeters = vec2(pixel).sub((SIZE - 1) / 2).mul(STEP);
    const noise = worldNoiseField(WORLD_NOISE_LAYERS.macro);
    const meso = worldNoiseField(WORLD_NOISE_LAYERS.meso);
    const field = wetnessTexel({
      slope: gradient.length(),
      hollow: around.sub(here),
      // A low sun dries little: its strike is scaled by its height.
      sun: max(normal.dot(sun), 0).mul(sun.y.mul(2.5).clamp(0, 1)),
      patches: noise(this.origins.latticePoint('patches', localMeters)).g,
      mottle: meso(this.origins.latticePoint('mottle', localMeters)).g,
      clocks: groundWetnessClocksUniform,
    });
    this.material = new THREE.NodeMaterial();
    this.material.name = 'ground-wetness-field';
    this.material.fragmentNode = vec4(field, 0, 1);
    this.material.toneMapped = false;
    this.material.depthTest = false;
    this.material.depthWrite = false;
    this.quad = new THREE.QuadMesh(this.material);
  }

  /**
   * @param {{ x: number, z: number }} focus camera, render space
   * @param {{ x: number, z: number }} origin floating origin (canonical = render + origin)
   * @param {object} [budget] DeferredWorkBudget: the height patch builds under it
   */
  update(focus, origin, budget = null, scheduler = null) {
    const dry = groundWetnessClocksUniform.value.toArray().every(value => value === 0);
    const wasDry = !this.last || this.last.clocks.every(value => value === 0);
    if (!dry || !wasDry || this.force) {
      const prepare = shouldYield => this.ground.update(focus, origin, shouldYield, budget);
      if (scheduler) scheduler.prepare('wetness-ground', budget, prepare);
      else (budget?.runner ?? ((run) => run()))(() => prepare(budget?.shouldYield));
    }
    // Every frame, so a floating-origin rebase moves the window with the ground.
    if (this.renderedCenter) {
      wetnessFieldUniforms.corner.value.set(this.renderedCenter.x - WETNESS_FIELD_METRES / 2 - origin.x,
        this.renderedCenter.z - WETNESS_FIELD_METRES / 2 - origin.z);
    }
  }

  /** Draw again on the next render whatever the cadence (WorldVisualQa.settleLighting). */
  settle() {
    this.force = true;
  }

  /**
   * Draw the field if its inputs changed. Call before the scene renders.
   * @param {THREE.WebGPURenderer} renderer
   * @param {number} nowSeconds absolute clock
   * @param {THREE.Vector3} sunValue the sun direction's CPU value
   * @param {{ x: number, z: number }} origin floating origin
   */
  render(renderer, nowSeconds, sunValue, origin, scheduler = null, budget = null) {
    if (!this.ground.ready) return false;
    const now = {
      clocks: groundWetnessClocksUniform.value.toArray(),
      sun: sunValue ? sunValue.toArray() : [0, 1, 0],
      window: this.ground.rebuilds,
    };
    const since = nowSeconds - this.lastRenderSeconds;
    if (!this.force && !wetnessFieldNeedsRender(this.last, now, since, this.config.intervalSeconds)) return false;
    const urgent = this.force || !this.last || this.last.window !== now.window;
    if (scheduler) return scheduler.run('wetness', budget, () => this.draw(renderer, nowSeconds, now, origin), { urgent });
    return this.draw(renderer, nowSeconds, now, origin);
  }

  draw(renderer, nowSeconds, now, origin) {
    const center = this.ground.center;
    this.origins.update(center.x, center.z);
    const previousTarget = renderer.getRenderTarget();
    const previousMrt = renderer.getMRT?.() ?? null;
    renderer.setMRT?.(null);
    renderer.setRenderTarget(wetnessFieldTarget);
    try {
      this.quad.render(renderer);
    } finally {
      renderer.setRenderTarget(previousTarget);
      renderer.setMRT?.(previousMrt);
    }
    this.force = false;
    this.last = now;
    this.lastRenderSeconds = nowSeconds;
    this.renderedCenter = { x: center.x, z: center.z };
    this.renders += 1;
    wetnessFieldUniforms.corner.value.set(center.x - WETNESS_FIELD_METRES / 2 - origin.x,
      center.z - WETNESS_FIELD_METRES / 2 - origin.z);
    wetnessFieldUniforms.active.value = 1;
    return true;
  }

  /**
   * The pass for the live world, or null with the field off.
   * @param {object} terrainView InfiniteTerrainView
   * @param {object|null} skyView StylizedSkyView (its sun); a noon sun without one
   * @param {object} config resolved `stylizedSurface.wetness.field`
   */
  static forTerrain(terrainView, skyView, config) {
    if (!config?.enabled) return null;
    const store = terrainView.worldStore;
    const sampling = new SettlementSamplingPreparation(store);
    const pass = new WetnessFieldPass({
      getHeight: (x, z) => terrainView.getCanonicalHeight(x, z),
      prepareBounds: (bounds, shouldYield) => sampling.prepare({
        minX: bounds.minX / store.tileSize, maxX: bounds.maxX / store.tileSize,
        minZ: -bounds.maxZ / store.tileSize, maxZ: -bounds.minZ / store.tileSize,
      }, shouldYield),
      getRevision: () => `${store.baseTerrainRevision}:${store.revision}`,
      sunDirection: skyView?.sunDirection ?? uniform(new THREE.Vector3(0, 1, 0)),
      config,
    });
    pass.sampling = sampling;
    return pass;
  }

  dispose() {
    this.sampling?.dispose();
    this.ground.dispose();
    this.material.dispose();
    wetnessFieldUniforms.active.value = 0;
  }
}
