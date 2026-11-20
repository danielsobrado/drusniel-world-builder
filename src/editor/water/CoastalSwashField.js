import * as THREE from 'three/webgpu';
import {
  Fn, exp, float, instanceIndex, int, ivec2, max, min, mix, oneMinus,
  sin, smoothstep, texture, textureStore, vec2, vec4,
} from 'three/tsl';
import { frameUniform } from '../../render/FrameUniforms.js';
import { PerfCounters } from '../performance/qa/PerfCounters.js';
import { createCoastPatternOrigins, DEFAULT_COAST_SWASH } from '../stylized/CoastSwashShading.js';
import { coastSwashForcingNodes } from '../stylized/CoastSwashForcingNodes.js';
import { coastalSwashUniforms, setCoastalSwashTexture } from '../stylized/CoastalSwashStateNodes.js';
import { coastalWindowOrigin, coastalScrollCells } from './CoastalSwashMath.js';
import { CoastalSwashInputs, nearOcean } from './CoastalSwashInputs.js';
import { coastalSwashResolution, resolveCoastalSwashConfig } from './CoastalSwashConfig.js';
import { seaStateUniforms } from './seaState.js';
import { SEA_SWELL_COMPONENTS } from './SeaSwell.js';
import { resolveSeaDiffraction } from './SeaDiffraction.js';

function makeStorageTexture(size, name) {
  const result = new THREE.StorageTexture(size, size);
  result.name = name;
  result.type = THREE.HalfFloatType;
  result.format = THREE.RGBAFormat;
  result.colorSpace = THREE.NoColorSpace;
  result.magFilter = THREE.LinearFilter;
  result.minFilter = THREE.LinearFilter;
  result.wrapS = THREE.ClampToEdgeWrapping;
  result.wrapT = THREE.ClampToEdgeWrapping;
  result.generateMipmaps = false;
  return result;
}

function stepUniforms() {
  return {
    time: frameUniform(0),
    delta: frameUniform(1 / 60),
    shift: frameUniform(new THREE.Vector2()),
    initialized: frameUniform(0),
  };
}

function makeCompute(source, target, inputs, patterns, coast, settings, diffraction, uniforms, size, forward) {
  const span = size * settings.texelMeters;
  const inputStep = settings.inputTexelMeters / span;
  const inputAt = uv => texture(inputs, uv).level(0);
  const stateAt = uv => texture(source, uv).level(0);
  return Fn(() => {
    const n = int(size);
    const x = int(instanceIndex).mod(n);
    const z = int(instanceIndex).div(n);
    const uv = vec2(float(x).add(0.5), float(z).add(0.5)).div(size);
    const input = inputAt(uv);
    const localXZ = uv.mul(span).sub(span * 0.5);
    const transmission = input.a.clamp(0, 1);
    const phaseLag = diffraction.enabled
      ? transmission.sub(1).mul(SEA_SWELL_COMPONENTS[0].waveNumber * diffraction.phaseLagMeters)
      : float(0);
    const forcing = coastSwashForcingNodes({
      localXZ, patternOrigins: patterns, height: input.r, clock: uniforms.time, config: coast,
      runupScale: transmission, phaseLag,
    });
    const reach = oneMinus(smoothstep(coast.runupMeters * 0.6, coast.runupMeters, max(input.g, 0)));
    const coastGate = input.b.mul(reach);
    const phaseBack = forcing.phase.sub(uniforms.delta.mul(2 * Math.PI / coast.period));
    const coverageNow = forcing.coverageAt(forcing.phase).mul(coastGate);
    const coveragePrev = forcing.coverageAt(phaseBack).mul(coastGate);
    const advancing = max(coverageNow.sub(coveragePrev), 0);
    const retreating = max(coveragePrev.sub(coverageNow), 0);

    const grad = vec2(
      inputAt(uv.add(vec2(inputStep, 0))).g.sub(inputAt(uv.sub(vec2(inputStep, 0))).g),
      inputAt(uv.add(vec2(0, inputStep))).g.sub(inputAt(uv.sub(vec2(0, inputStep))).g),
    ).div(2 * settings.inputTexelMeters);
    const landward = grad.div(max(grad.length(), 0.001));
    const slope = vec2(
      inputAt(uv.add(vec2(inputStep, 0))).r.sub(inputAt(uv.sub(vec2(inputStep, 0))).r),
      inputAt(uv.add(vec2(0, inputStep))).r.sub(inputAt(uv.sub(vec2(0, inputStep))).r),
    ).div(2 * settings.inputTexelMeters).dot(landward).max(settings.minSlope);

    const shift = forward ? uniforms.shift : vec2(0);
    const historicUv = uv.add(shift);
    const valid = smoothstep(0, 0.0001, historicUv.x)
      .mul(oneMinus(smoothstep(0.9999, 1, historicUv.x)))
      .mul(smoothstep(0, 0.0001, historicUv.y))
      .mul(oneMinus(smoothstep(0.9999, 1, historicUv.y)))
      .mul(forward ? uniforms.initialized : float(1));
    const here = stateAt(historicUv.clamp(vec2(0), vec2(1))).mul(valid);
    const frontSpeed = forcing.frontVelocity;
    const uprush = min(max(frontSpeed, 0).div(slope), settings.maxUprushSpeed);
    const backwash = min(max(frontSpeed.negate(), 0).div(slope), settings.maxBackwashSpeed);
    const velocity = landward.mul(uprush.sub(backwash)).mul(here.g.mul(0.85).add(0.15));
    const sideways = sin(patterns.wavePhase('frontBreakup', localXZ))
      .mul(settings.lateralSpeed).mul(coastGate).mul(transmission);
    const transportedVelocity = velocity.add(
      vec2(landward.y.negate(), landward.x).mul(sideways),
    );
    const previousUv = historicUv.sub(transportedVelocity.mul(uniforms.delta.div(span)));
    const fromInside = smoothstep(0, 0.0001, previousUv.x)
      .mul(oneMinus(smoothstep(0.9999, 1, previousUv.x)))
      .mul(smoothstep(0, 0.0001, previousUv.y))
      .mul(oneMinus(smoothstep(0.9999, 1, previousUv.y)))
      .mul(forward ? uniforms.initialized : float(1));
    const carried = stateAt(previousUv.clamp(vec2(0), vec2(1))).mul(fromInside);

    const d = uniforms.delta;
    const wetBaseline = oneMinus(smoothstep(-0.12, 0.30, input.r)).mul(0.2);
    const wetness = max(here.r.mul(exp(d.div(-settings.wetSeconds))),
      max(coverageNow, wetBaseline)).clamp(0, 1);
    const film = max(carried.g.mul(exp(d.div(-settings.filmSeconds))), coverageNow).clamp(0, 1);
    const foamLifetime = mix(settings.foamDrySeconds, settings.foamWetSeconds, film)
      .add(coverageNow.mul(settings.foamWaterSeconds - settings.foamWetSeconds));
    const packet = sin(patterns.wavePhase('frontBreakup', localXZ).mul(3)).mul(0.2).add(0.8);
    const breaker = seaStateUniforms.storm.mul(0.45).add(0.55).clamp(0, 1);
    const injected = advancing.mul(settings.foamInjection).mul(packet).mul(breaker)
      .mul(transmission);
    const mobile = carried.b.mul(exp(d.div(foamLifetime).negate()))
      .add(injected).clamp(0, 1);
    const deposit = min(mobile, mobile.mul(retreating).mul(settings.foamDeposition));
    const stranded = here.a.mul(exp(d.div(-settings.strandedSeconds)))
      .mul(exp(advancing.mul(-settings.washOff)))
      .add(deposit).clamp(0, 1);
    const result = vec4(wetness, film, mobile.sub(deposit), stranded)
      .mul(coastGate);
    textureStore(target, ivec2(x, z), result);
  })().compute(size * size, [64]);
}

/** Persistent, single-view coastal state; no per-chunk simulation or readback. */
export class CoastalSwashField {
  constructor({ renderer, terrainView, coastConfig, qualityTier, seaSurfConfig = null }) {
    this.renderer = renderer;
    this.terrainView = terrainView;
    this.coast = { ...DEFAULT_COAST_SWASH, ...coastConfig };
    this.settings = resolveCoastalSwashConfig(coastConfig?.persistent);
    this.diffraction = resolveSeaDiffraction(seaSurfConfig?.enabled
      && seaSurfConfig?.model === 'directionalBreakers' ? seaSurfConfig.diffraction : undefined);
    this.size = coastalSwashResolution(this.settings, qualityTier);
    this.supported = Boolean(this.size && renderer?.backend?.isWebGPUBackend && this.coast.enabled);
    this.span = this.size * this.settings.texelMeters;
    this.originX = NaN;
    this.originZ = NaN;
    this.revision = null;
    this.lastTime = null;
    this.accumulator = 0;
    this.initialized = false;
    this.lastActivation = -Infinity;
    this.lastActivationX = NaN;
    this.lastActivationZ = NaN;
    this.active = false;
    this.disposed = false;
    this.dispatchCount = 0;
    this.inputRebuildCount = 0;
    this.resetCount = 0;
    if (!this.supported) return;

    this.state = makeStorageTexture(this.size, 'coastal-swash-state');
    this.scratch = makeStorageTexture(this.size, 'coastal-swash-scratch');
    this.inputs = new CoastalSwashInputs(
      terrainView.worldStore, Math.round(this.span / this.settings.inputTexelMeters),
      this.settings.inputTexelMeters, this.coast.runupMeters, this.diffraction,
    );
    this.patterns = createCoastPatternOrigins();
    // Each dispatch owns uniforms so queued compute passes never observe the next step's values.
    this.passes = Array.from({ length: this.settings.maxStepsPerFrame }, () => {
      const forwardStep = stepUniforms();
      const backwardStep = stepUniforms();
      return {
        forwardStep,
        backwardStep,
        forward: makeCompute(this.state, this.scratch, this.inputs.texture,
          this.patterns, this.coast, this.settings, this.diffraction, forwardStep, this.size, true),
        backward: makeCompute(this.scratch, this.state, this.inputs.texture,
          this.patterns, this.coast, this.settings, this.diffraction, backwardStep, this.size, false),
      };
    });
    setCoastalSwashTexture(this.state);
    coastalSwashUniforms.inverseSpan.value = 1 / this.span;
    coastalSwashUniforms.fadeFraction.value = this.settings.boundaryFadeMeters / this.span;
  }

  update(camera, timeSeconds) {
    if (!this.supported || this.disposed || !camera || !Number.isFinite(timeSeconds)) return;
    const canonical = this.terrainView.floatingOrigin.toCanonical(camera.position.x, camera.position.z);
    const revision = `${this.terrainView.worldStore.baseTerrainRevision}:${this.terrainView.worldStore.revision}`;
    if (this.activationRevision !== revision || timeSeconds < this.lastActivation || timeSeconds - this.lastActivation >= 1
      || Math.hypot(canonical.x - this.lastActivationX, canonical.z - this.lastActivationZ) >= this.settings.scrollMeters) {
      this.active = nearOcean(this.terrainView.worldStore, canonical.x, canonical.z,
        this.settings.activationDistanceMeters);
      this.activationRevision = revision;
      this.lastActivation = timeSeconds;
      this.lastActivationX = canonical.x;
      this.lastActivationZ = canonical.z;
    }
    if (!this.active) {
      coastalSwashUniforms.active.value = 0;
      PerfCounters.set('coastalSwashActive', 0);
      PerfCounters.set('coastalSwashComputeDispatches', 0);
      this.lastTime = timeSeconds;
      this.initialized = false;
      this.accumulator = 0;
      return;
    }
    const nextX = coastalWindowOrigin(canonical.x, this.span, this.settings.scrollMeters);
    const nextZ = coastalWindowOrigin(canonical.z, this.span, this.settings.scrollMeters);
    const moved = nextX !== this.originX || nextZ !== this.originZ;
    if (moved || this.revision !== revision) {
      const previousX = this.originX;
      const previousZ = this.originZ;
      if (this.inputs.update(nextX, nextZ)) this.inputRebuildCount++;
      this.pendingShiftX = this.initialized ? coastalScrollCells(previousX, nextX, this.settings.texelMeters) / this.size : 0;
      this.pendingShiftZ = this.initialized ? coastalScrollCells(previousZ, nextZ, this.settings.texelMeters) / this.size : 0;
      if (this.revision !== null && this.revision !== revision) {
        this.initialized = false;
        this.resetCount++;
      }
      this.originX = nextX;
      this.originZ = nextZ;
      this.revision = revision;
      this.patterns.update(nextX + this.span / 2, nextZ + this.span / 2);
    }

    const render = this.terrainView.floatingOrigin.toRender(nextX, nextZ);
    coastalSwashUniforms.renderOrigin.value.set(render.x, render.z);
    if (!this.inputs.eligibleCount) {
      coastalSwashUniforms.active.value = 0;
      PerfCounters.set('coastalSwashActive', 0);
      PerfCounters.set('coastalSwashComputeDispatches', 0);
      this.initialized = false;
      this.lastTime = timeSeconds;
      return;
    }

    const dt = 1 / this.settings.fixedHz;
    const elapsed = this.lastTime === null ? dt : timeSeconds - this.lastTime;
    this.lastTime = timeSeconds;
    if (elapsed < 0 || elapsed > 0.5) {
      this.initialized = false;
      this.accumulator = 0;
    } else {
      this.accumulator = Math.min(dt * this.settings.maxStepsPerFrame, this.accumulator + elapsed);
    }
    if (moved && this.accumulator < dt) this.accumulator = dt;
    let steps = 0;
    while (this.accumulator >= dt && steps < this.settings.maxStepsPerFrame) {
      const pass = this.passes[steps];
      const halfDt = dt * 0.5;
      pass.forwardStep.time.value = timeSeconds - this.accumulator + halfDt;
      pass.forwardStep.delta.value = halfDt;
      pass.forwardStep.initialized.value = this.initialized ? 1 : 0;
      pass.forwardStep.shift.value.set(this.pendingShiftX ?? 0, this.pendingShiftZ ?? 0);
      pass.backwardStep.time.value = timeSeconds - this.accumulator + dt;
      pass.backwardStep.delta.value = halfDt;
      const onFailure = (error) => {
        if (!this.supported) return;
        console.error('Persistent coastal swash compute failed; restoring analytic swash.', error);
        coastalSwashUniforms.active.value = 0;
        this.supported = false;
      };
      try {
        const forwardJob = this.renderer.compute(pass.forward);
        const backwardJob = this.renderer.compute(pass.backward);
        forwardJob?.catch?.(onFailure);
        backwardJob?.catch?.(onFailure);
      } catch (error) {
        onFailure(error);
        return;
      }
      this.initialized = true;
      this.pendingShiftX = 0;
      this.pendingShiftZ = 0;
      this.accumulator -= dt;
      steps++;
    }
    coastalSwashUniforms.active.value = this.initialized ? 1 : 0;
    this.dispatchCount += steps * 2;
    PerfCounters.set('coastalSwashActive', this.initialized ? 1 : 0);
    PerfCounters.set('coastalSwashComputeDispatches', steps * 2);
    PerfCounters.set('coastalSwashStateBytes', this.size * this.size * 16);
    PerfCounters.set('coastalSwashWindowResets', this.resetCount);
    PerfCounters.set('coastalSwashInputRebuilds', this.inputRebuildCount);
    PerfCounters.set('coastalSwashActiveTexels', this.initialized ? this.size * this.size : 0);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    coastalSwashUniforms.active.value = 0;
    setCoastalSwashTexture(null);
    for (const pass of this.passes ?? []) {
      pass.forward.dispose?.();
      pass.backward.dispose?.();
    }
    this.state?.dispose();
    this.scratch?.dispose();
    this.inputs?.dispose();
  }
}
