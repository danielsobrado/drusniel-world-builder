import { CubeCamera, CubeRenderTarget, HalfFloatType, LinearFilter, Matrix4, RenderTarget, Vector3 } from 'three/webgpu';
import { abs, cubeTexture, distance, float, mix, positionWorld, smoothstep, texture, uniform, vec2, vec4 } from 'three/tsl';
import { PerfCounters } from '../../editor/performance/qa/PerfCounters.js';
import { withReflectionCapture } from './ReflectionCapture.js';
import { preparePlanarCamera } from './PlanarCamera.js';
import { withAuxiliaryScene } from './ReflectionScene.js';
import { isLandStreamingSuspended } from '../../editor/water/underwaterState.js';

/** Fixed-size local capture pool, owned by the scene rather than by water chunks. */
export class WaterReflectionController {
  constructor(terrainView, config) {
    this.view = terrainView;
    this.config = config;
    this.targets = [0, 1].map(() => new CubeRenderTarget(config.resolution, { type: HalfFloatType, minFilter: LinearFilter, generateMipmaps: false }));
    this.front = 0;
    this.cubeCamera = new CubeCamera(0.5, config.reachMeters * 3, this.targets[1]);
    this.cube = cubeTexture(this.targets[0].texture);
    this.valid = uniform(0);
    this.origin = uniform(new Vector3());
    this.planarTarget = config.planar ? new RenderTarget(config.resolution * 2, config.resolution, { type: HalfFloatType, minFilter: LinearFilter, generateMipmaps: false }) : null;
    this.planar = this.planarTarget ? texture(this.planarTarget.texture) : null;
    this.planarMatrix = uniform(new Matrix4());
    this.planarHeight = uniform(0);
    this.planarValid = uniform(0);
    this.canonicalProbe = null;
    this.pendingProbe = null;
    this.face = 0;
    this.nextCapture = 0;
    this.lastPlanar = -Infinity;
    this.sceneRevision = null;
    this.disposed = false;
    this.capturing = false;
    this.wetSlots = [];
    this.hiddenObjects = [];
    this.planarWetSlots = [];
    this.preparedState = { origin: null, canonical: { x: 0, z: 0 }, wet: this.wetSlots };
    this.captureScratch = { states: [], shadows: [] };
    this.lastCaptureCpuMs = 0;
  }

  sample(direction, fallback, allowPlanar = float(1)) {
    const local = this.valid.mul(smoothstep(this.config.reachMeters * 0.7, this.config.reachMeters,
      distance(positionWorld, this.origin)).oneMinus());
    let result = mix(fallback, this.cube.sample(direction).rgb, local);
    if (this.planar) {
      const clip = this.planarMatrix.mul(vec4(positionWorld, 1));
      const ndc = clip.xy.div(clip.w.max(0.0001));
      const uv = vec2(ndc.x.mul(0.5).add(0.5), float(0.5).sub(ndc.y.mul(0.5)));
      const offset = uv.sub(0.5).abs();
      const edge = offset.x.max(offset.y);
      const weight = this.planarValid.mul(local).mul(allowPlanar).mul(clip.w.greaterThan(0.001).select(1, 0)).mul(smoothstep(0.44, 0.5, edge).oneMinus())
        .mul(smoothstep(0.1, 0.3, abs(positionWorld.y.sub(this.planarHeight))).oneMinus());
      result = mix(result, this.planar.sample(uv).rgb, weight);
    }
    return result;
  }

  invalidate() { this.valid.value = 0; this.planarValid.value = 0; this.face = 0; this.nextCapture = 0; this.lastPlanar = -Infinity; this.canonicalProbe = null; this.pendingProbe = null; this.planarPending = false; }

  // Validity must follow world/camera changes even when no capture work fits.
  prepare(camera, surface) {
    if (this.disposed || this.capturing) return;
    if (isLandStreamingSuspended()) { this.invalidate(); return; }
    if (this.planarValid.value && camera.position.y <= this.planarHeight.value + 0.1) this.planarValid.value = 0;
    const origin = this.view.floatingOrigin.getState();
    if (this.generator !== this.view.worldStore.generator || this.lastOrigin?.x !== origin.x || this.lastOrigin?.z !== origin.z) {
      this.invalidate(); this.generator = this.view.worldStore.generator; this.lastOrigin = { ...origin };
    }
    const canonical = this.preparedState.canonical;
    canonical.x = camera.position.x + origin.x;
    canonical.z = camera.position.z + origin.z;
    const revision = `${this.view.worldStore.revision ?? 0}:${surface.revisionTracker?.revision ?? 0}:${surface.objectMap?.revision ?? 0}:${this.revisionProvider?.() ?? 0}`;
    if (revision !== this.sceneRevision) { this.invalidate(); this.sceneRevision = revision; }
    const wet = this.wetSlots;
    wet.length = 0;
    let nearby = false;
    for (const slot of surface.waterSlots) {
      if (!slot.hasWaterCoverage || !slot.terrainSlot.descriptor) continue;
      wet.push(slot);
      const d = slot.terrainSlot.descriptor;
      if (Math.hypot(d.centerWorldX - canonical.x, d.centerWorldZ - canonical.z)
        < this.config.reachMeters + this.view.chunkWorldSize) nearby = true;
    }
    if (!nearby) { this.invalidate(); return; }
    if (this.canonicalProbe && (Math.hypot(canonical.x - this.canonicalProbe.x, canonical.z - this.canonicalProbe.z) > this.config.reachMeters * 0.5
      || Math.abs(camera.position.y - this.probeY) > this.config.reachMeters * 0.2)) this.invalidate();
    if (this.canonicalProbe) this.origin.value.set(this.canonicalProbe.x - origin.x, this.probeY, this.canonicalProbe.z - origin.z);
    this.preparedState.origin = origin;
    return this.preparedState;
  }

  update(camera, surface, now = performance.now(), { budgetReserved = false, prepared = null } = {}) {
    const state = prepared ?? this.prepare(camera, surface);
    if (!state) return;
    const { origin, canonical, wet } = state;
    if (now < this.nextCapture) return;
    if (!budgetReserved && surface.shouldYieldWork?.()) return;
    const hidden = this.hiddenObjects;
    hidden.length = 0;
    for (const slot of surface.waterSlots) hidden.push(slot.mesh);
    this.view.scene.traverse(object => {
      if (object.userData?.editorOverlay || object.name?.includes('grid-overlay')) hidden.push(object);
    });
    const started = performance.now();
    this.capturing = true;
    try {
      withReflectionCapture(this.view.renderer, this.view.scene, hidden, () => {
        if (this.planarPending) {
          this.capturePlanar(camera, wet, origin, now, surface);
          this.planarPending = false;
          this.nextCapture = now + this.config.intervalMs;
          return;
        }
        if (this.face === 0) {
          this.pendingProbe = canonical;
          this.pendingProbeY = camera.position.y;
          this.cubeCamera.position.set(camera.position.x, camera.position.y, camera.position.z);
          this.cubeCamera.coordinateSystem = this.view.renderer.coordinateSystem;
          this.cubeCamera.updateCoordinateSystem();
          this.cubeCamera.updateMatrixWorld();
        }
        const back = this.targets[1 - this.front];
        this.view.renderer.setRenderTarget(back, this.face);
        const captureCamera = this.cubeCamera.children[this.face];
        withAuxiliaryScene(surface, captureCamera, origin, now, () => this.view.renderer.render(this.view.scene, captureCamera));
        this.face += 1;
        PerfCounters.inc('waterProbeFaces');
        if (this.face === 6) {
          this.front = 1 - this.front;
          this.cube.value = this.targets[this.front].texture;
          this.canonicalProbe = this.pendingProbe;
          this.probeY = this.pendingProbeY;
          this.valid.value = 1;
          this.origin.value.set(this.canonicalProbe.x - origin.x, this.probeY, this.canonicalProbe.z - origin.z);
          this.face = 0;
          this.nextCapture = now + this.config.intervalMs;
          this.planarPending = Boolean(this.planarTarget);
        }
      }, this.captureScratch);
    } finally {
      this.capturing = false;
      this.lastCaptureCpuMs = performance.now() - started;
      PerfCounters.inc('waterReflectionCpuMs', this.lastCaptureCpuMs);
    }
  }

  capturePlanar(camera, wet, origin, now, surface) {
    if (!this.planarTarget || now - this.lastPlanar < this.config.intervalMs) return;
    const ordered = this.planarWetSlots;
    ordered.length = 0;
    for (const slot of wet) ordered.push(slot);
    ordered.sort((a, b) => {
      const dist = slot => { const d = slot.terrainSlot.descriptor; return Math.hypot(d.centerWorldX - origin.x - camera.position.x, d.centerWorldZ - origin.z - camera.position.z); };
      return dist(a) - dist(b);
    });
    for (const slot of ordered.slice(0, 4)) {
      const d = slot.terrainSlot.descriptor;
      const water = this.view.getCanonicalWater(d.centerWorldX, d.centerWorldZ);
      if (![1, 2].includes(water.kind) || water.coverage < 0.5 || camera.position.y <= water.surfaceHeight + 0.1) continue;
      const virtual = preparePlanarCamera(camera, water.surfaceHeight, this.virtualCamera);
      this.virtualCamera = virtual;
      this.view.renderer.setRenderTarget(this.planarTarget);
      withAuxiliaryScene(surface, virtual, origin, now, () => this.view.renderer.render(this.view.scene, virtual));
      this.planarMatrix.value.multiplyMatrices(virtual.projectionMatrix, virtual.matrixWorldInverse);
      this.planarHeight.value = water.surfaceHeight;
      this.planarValid.value = 1;
      this.lastPlanar = now;
      PerfCounters.inc('waterPlanarCaptures');
      return;
    }
    this.planarValid.value = 0;
  }

  dispose() { this.disposed = true; this.invalidate(); for (const target of this.targets) target.dispose(); this.planarTarget?.dispose(); }

  prewarm(camera, surface) {
    const now = performance.now();
    for (let pass = 0; pass < (this.planarTarget ? 7 : 6); pass++) this.update(camera, surface, now + pass * (this.config.intervalMs + 1));
    this.nextCapture = performance.now() + this.config.intervalMs;
    this.lastPlanar = performance.now();
  }
}
