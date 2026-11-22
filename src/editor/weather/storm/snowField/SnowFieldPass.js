/**
 * Draws the storm snow field (snowFieldState.js) around the camera: one small
 * full-screen pass over a window snapped to whole texels in canonical metres,
 * from the ground patch under it, the prevailing wind and the sun.
 * docs/plans/storm-snow-field-2026-11-21.md.
 *
 * - Lee slopes, flats and hollows build faster; windward and steep faces slower.
 * - A wind-streaked drift pattern creeps downwind while snow falls.
 * - Thawing, sun-facing slopes lose their snow first.
 *
 * The desert sand field rides the same pass (docs/plans/desert-sand-field-2026-11-22.md):
 * its gain goes to the alpha channel from the same slope, lee, hollow and drift
 * terms, and the pass draws while either cover lies. With sand off, alpha stays 1
 * and the pass compiles as before.
 *
 * Visual only: nothing is read back, and no CPU twin exists because no gameplay
 * reads it. Off, main never builds this, so no GPU work runs.
 */

import * as THREE from 'three/webgpu';
import { clamp, dot, float, max, mix, normalize, smoothstep, uniform, uv, vec2, vec3, vec4 } from 'three/tsl';
import { LocalGroundHeight } from '../../../stylized/ambient/LocalGroundHeight.js';
import { PATTERN_PERIOD, wrapPeriodic } from '../../../stylized/PatternOrigins.js';
import { periodicFbm2 } from '../../../stylized/PeriodicNoiseNodes.js';
import { SettlementSamplingPreparation } from '../../../world/settlements/SettlementSamplingPreparation.js';
import { worldWindCamera, worldWindUniforms } from '../../wind/worldWindState.js';
import { snapWindowCenter, snowFieldTarget, snowFieldUniforms } from './snowFieldState.js';

/** Laplacian (1/m) that counts as a full hollow or crest. */
const HOLLOW_PER_LAPLACIAN = 10;
const MAX_STEP_SECONDS = 0.25;
/**
 * Metres the creeping drift moves between redraws. A twelfth of a 4 m texel is
 * invisible, and it bounds a storm's redraws to a few a second, not every frame.
 */
export const DRIFT_STEP_METRES = 0.25;
/** Seconds between redraws while a thaw follows the moving sun. */
const THAW_REDRAW_SECONDS = 0.5;

/** The drift offset in whole steps, so the pattern only moves (and redraws) a step at a time. */
export function steppedDriftOffset(offset, step = DRIFT_STEP_METRES) {
  return Math.round(offset / step) * step;
}

/**
 * The drift pattern's coordinate at the window centre, in double precision and
 * wrapped by the periodic noise's period: streaks `alongMetres` long down the
 * wind and `acrossMetres` apart, shifted downwind by `offset`. The shader adds
 * the texel's small offset from the centre, so no float32 canonical position
 * is ever scaled.
 * @returns {[number, number]}
 */
export function driftPatternOrigin(centerX, centerZ, offsetX, offsetZ, directionX, directionZ, alongMetres, acrossMetres) {
  const x = centerX - offsetX;
  const z = centerZ - offsetZ;
  return [
    wrapPeriodic((x * directionX + z * directionZ) / alongMetres, PATTERN_PERIOD),
    wrapPeriodic((z * directionX - x * directionZ) / acrossMetres, PATTERN_PERIOD),
  ];
}

export class SnowFieldPass {
  /**
   * @param {object} options
   * @param {object} options.config resolved `weatherEffects.snowField`
   * @param {(x: number, z: number) => number} options.getHeight canonical metres
   * @param {Function} [options.prepareBounds] LocalGroundHeight's ground preparation
   * @param {() => unknown} [options.getRevision] terrain revision
   * @param {object} [options.sunDirection] TSL vec3 toward the sun
   * @param {object} [options.sand] resolved `weatherEffects.sandField`; off or absent draws no sand
   */
  constructor({ config, getHeight, prepareBounds, getRevision, sunDirection = null, sand = null }) {
    this.config = config;
    this.sand = sand?.enabled ? sand : null;
    this.sandCover = 0;
    const texel = config.windowMetres / config.resolution;
    this.texel = texel;
    this.ground = new LocalGroundHeight({
      getHeight, prepareBounds, getRevision, resolution: config.resolution + 1, extent: config.windowMetres,
    });
    this.offset = { x: 0, z: 0 };
    this.clock = 0;
    this.cover = 0;
    this.renderKey = '';
    this.focus = { x: 0, z: 0 };
    this.origin = null;
    this.uniforms = {
      melting: uniform(0),
      driftOrigin: uniform(new THREE.Vector2()),
      direction: uniform(new THREE.Vector2(1, 0)),
    };
    snowFieldUniforms.windowSize.value = config.windowMetres;

    const { windowCenter } = snowFieldUniforms;
    const local = uv().sub(0.5).mul(config.windowMetres);
    const render = windowCenter.add(local);
    const height = (dx, dz) => this.ground.heightNode(render.x.add(dx), render.y.add(dz));
    const centre = height(0, 0);
    const east = height(texel, 0), west = height(-texel, 0), north = height(0, texel), south = height(0, -texel);
    const gradient = vec2(east.sub(west), north.sub(south)).div(2 * texel);
    const slope = gradient.length();
    const downhill = gradient.negate().div(max(slope, 1e-4));
    const tilted = smoothstep(0.05, 0.3, slope);
    const lee = dot(downhill, worldWindUniforms.prevailing).mul(tilted);
    const steep = smoothstep(0.7, 1.2, slope);
    const laplacian = east.add(west).add(north).add(south).sub(centre.mul(4)).div(texel * texel);
    const hollow = clamp(laplacian.mul(HOLLOW_PER_LAPLACIAN), -1, 1);

    const { direction } = this.uniforms;
    const along = dot(local, direction).div(config.driftAlongMetres);
    const across = local.y.mul(direction.x).sub(local.x.mul(direction.y)).div(config.driftAcrossMetres);
    const drift = periodicFbm2(this.uniforms.driftOrigin.add(vec2(along, across)));
    const rate = float(config.flatGain).add(lee.mul(config.leeGain)).add(hollow.mul(config.hollowGain))
      .sub(steep.mul(config.steepLoss * config.flatGain));
    const build = max(rate.mul(drift.mul(2).sub(1).mul(config.driftContrast).add(1)), 0);

    const sun = sunDirection ?? vec3(0.35, 0.85, 0.25).normalize();
    const sunAcross = normalize(vec2(sun.x, sun.z).add(vec2(1e-5, 0)));
    const sunFacing = clamp(dot(downhill, sunAcross).mul(tilted).mul(smoothstep(0, 0.15, sun.y)), 0, 1);
    const melt = build.mul(float(1).sub(sunFacing.mul(config.sunMelt)));

    this.material = new THREE.NodeMaterial();
    this.material.name = 'storm-snow-field';
    // Sand: the same terrain terms, its own gains, no melt (it blows away evenly).
    const sandGain = this.sand ? max(float(this.sand.flatGain).add(lee.mul(this.sand.leeGain))
      .add(hollow.mul(this.sand.hollowGain)).sub(steep.mul(this.sand.steepLoss * this.sand.flatGain))
      .mul(drift.mul(2).sub(1).mul(this.sand.driftContrast).add(1)), 0) : 1;
    this.material.fragmentNode = vec4(mix(build, melt, this.uniforms.melting), build, melt, sandGain);
    this.material.toneMapped = false;
    this.material.depthTest = false;
    this.material.depthWrite = false;
    this.quad = new THREE.QuadMesh(this.material);
  }

  /**
   * @param {number} dt seconds
   * @param {{ x: number, z: number }} cameraRender camera position, render space
   * @param {{ x: number, z: number }} origin floating origin (canonical = render + origin)
   * @param {object} storm `{ cover, melting, snowFall, snap, sandCover, sandFall }`: SnowCover's
   *   value and phase, this frame's snowfall 0..1, whether the storm is snapped (QA: drifts
   *   hold still), and SandCover's value and the sandstorm 0..1 blowing now
   */
  update(dt, cameraRender, origin, { cover, melting, snowFall, snap = false, sandCover = 0, sandFall = 0 }) {
    this.focus.x = cameraRender.x;
    this.focus.z = cameraRender.z;
    this.origin = origin;
    this.cover = this.config.enabled ? cover : 0;
    this.sandCover = this.sand ? sandCover : 0;
    const fall = Math.max(snowFall, this.sand ? sandFall : 0);
    // No cover, nothing to draw: the ground patch waits for the first storm rather
    // than rebuilding on the CPU every 64 m of clear-weather travel.
    if (this.cover > 0 || this.sandCover > 0) this.ground.update(this.focus, origin, yieldAfter(1));
    const step = Math.min(Math.max(Number.isFinite(dt) ? dt : 0, 0), MAX_STEP_SECONDS);
    this.clock += step;
    const wind = worldWindUniforms.prevailing.value;
    if (!snap && fall > 0) {
      const creep = this.config.driftSpeed * fall * worldWindCamera.envelope * step;
      this.offset.x += wind.x * creep;
      this.offset.z += wind.y * creep;
    }
    this.uniforms.melting.value = melting;
    this.uniforms.direction.value.set(wind.x, wind.y);
    const center = this.ground.center;
    if (!center) return;
    const snapped = snapWindowCenter(center.x, center.z, this.texel);
    snowFieldUniforms.windowCenterCanonical.value.set(snapped.x, snapped.z);
    snowFieldUniforms.windowCenter.value.set(snapped.x - origin.x, snapped.z - origin.z);
    const [u, v] = driftPatternOrigin(snapped.x, snapped.z, steppedDriftOffset(this.offset.x), steppedDriftOffset(this.offset.z),
      wind.x, wind.y, this.config.driftAlongMetres, this.config.driftAcrossMetres);
    this.uniforms.driftOrigin.value.set(u, v);
    // A thaw follows the moving sun, a couple of times a second; otherwise a held cover draws nothing new.
    const thaw = melting > 0 ? Math.floor(this.clock / THAW_REDRAW_SECONDS) : -1;
    this.nextKey = [snapped.x, snapped.z, u, v, wind.x, wind.y, this.ground.rebuilds, thaw].join();
  }

  /** Draw the field when there is snow or sand to place and its inputs moved. Call before the scene. */
  render(renderer) {
    if (!(this.cover > 0 || this.sandCover > 0) || !this.ground.ready || (this.nextKey !== null && this.nextKey === this.renderKey)) return;
    const previousTarget = renderer.getRenderTarget();
    const previousMrt = renderer.getMRT?.() ?? null;
    renderer.setMRT?.(null);
    renderer.setRenderTarget(snowFieldTarget());
    try {
      this.quad.render(renderer);
    } finally {
      renderer.setRenderTarget(previousTarget);
      renderer.setMRT?.(previousMrt);
    }
    this.renderKey = this.nextKey;
    snowFieldUniforms.active.value = 1;
  }

  /** QA: finish the ground patch now, so a settled capture is complete. */
  settle() {
    if (this.origin && (this.ground.job || !this.ground.ready)) this.ground.rebuild(this.focus, this.origin);
  }

  dispose() {
    this.ground.dispose();
    this.material.dispose();
  }
}

function yieldAfter(milliseconds) {
  const start = performance.now();
  return () => performance.now() - start > milliseconds;
}

/**
 * The field for a terrain view, or null when snow and sand are both off (then nothing is built).
 * @param {object} options
 * @param {object} options.config resolved `weatherEffects.snowField`
 * @param {object} [options.sand] resolved `weatherEffects.sandField`
 * @param {object} options.terrainView InfiniteTerrainView
 * @param {object} [options.sunDirection] TSL vec3 toward the sun
 */
export function createSnowFieldPass({ config, sand = null, terrainView, sunDirection = null }) {
  if (!config?.enabled && !sand?.enabled) return null;
  const { worldStore } = terrainView;
  const sampling = new SettlementSamplingPreparation(worldStore);
  return new SnowFieldPass({
    config,
    sand,
    sunDirection,
    getHeight: (x, z) => terrainView.getCanonicalHeight(x, z),
    // As the valley mist's patch: tiles are prepared in tile units, z flipped.
    prepareBounds: (bounds, shouldYield) => sampling.prepare({
      minX: bounds.minX / worldStore.tileSize, maxX: bounds.maxX / worldStore.tileSize,
      minZ: -bounds.maxZ / worldStore.tileSize, maxZ: -bounds.minZ / worldStore.tileSize,
    }, shouldYield),
    getRevision: () => `${worldStore.baseTerrainRevision}:${worldStore.revision}`,
  });
}
