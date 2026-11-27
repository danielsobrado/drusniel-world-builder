import { admitCompute } from '../../performance/gpu/GpuComputeBudget.js';
import * as THREE from 'three/webgpu';
import {
  Fn, If, Loop, abs, atan, clamp, cos, exp, float, instanceIndex, int, ivec2, length, max, min, mix, round,
  sin, smoothstep, textureLoad, textureStore, uniformArray, vec2, vec4,
} from 'three/tsl';
import { frameUniform } from '../../../render/FrameUniforms.js';
import { worldWindUniforms } from '../../weather/wind/worldWindState.js';
import { noise2 } from '../SnowNoiseNodes.js';

/**
 * WebGPU Compute 4-channel toroidal snow deformation simulation
 * (adapted & upgraded to compute from Noniv/snowflow_demo `deformSim.fragment.wgsl`, MIT):
 *
 *  - 512² RGBA16F StorageTexture ping-pong covering a 32 m toroidal window (6.25 cm texels).
 *  - Channels: R depression (m), G displaced raised berm (m), B compression (0..1), A refrozen ice (0..1).
 *  - Anisotropic diffusion (berms slump 3x faster than compacted trenches), directional
 *    upwind snow infill, mass-conserving slump, and banked `dt` to avoid FP16 ULP underflow.
 *  - Zero CPU per-texel loops and zero runtime GPU-to-CPU readbacks.
 */

export const SNOW_DEFORM_TEXELS = 512;
export const SNOW_DEFORM_WINDOW_METRES = 32;
export const SNOW_DEFORM_TEXEL_METRES = SNOW_DEFORM_WINDOW_METRES / SNOW_DEFORM_TEXELS;
export const SNOW_DEFORM_BRUSH_CAPACITY = 16;
const BANKED_RELAX_STEP_SECONDS = 0.4;
const MAX_DEPTH_METRES = 0.36;
const MAX_BERM_METRES = 0.24;

function makeStorageTarget(name) {
  const tex = new THREE.StorageTexture(SNOW_DEFORM_TEXELS, SNOW_DEFORM_TEXELS);
  tex.name = name;
  tex.type = THREE.HalfFloatType;
  tex.format = THREE.RGBAFormat;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}

/** Module-level GPU texture sampled by terrain materials (follows RippleField pattern). */
export const gpuSnowDeformTexture = makeStorageTarget('gpu-snow-deform-a');
const scratchTexture = makeStorageTarget('gpu-snow-deform-b');

export const gpuSnowDeformUniforms = Object.freeze({
  /** 1 while WebGPU compute sim has active snow deformation; 0 skips terrain branch cleanly. */
  active: frameUniform(0),
  /** Snapped toroidal window centre in canonical metres (modulo precision handled via relative delta). */
  centerCanonical: frameUniform(new THREE.Vector2()),
  /** Same centre in render space, for fast falloff distance tests. */
  centerRender: frameUniform(new THREE.Vector2()),
});

const simUniforms = Object.freeze({
  center: frameUniform(new THREE.Vector2()),
  prevCenter: frameUniform(new THREE.Vector2()),
  relaxDt: frameUniform(0),
  refillRate: frameUniform(1),
  brushCount: frameUniform(0, 'int'),
  // Row A: (relX, relZ from center, radius, elongation)
  brushA: uniformArray(Array.from({ length: SNOW_DEFORM_BRUSH_CAPACITY }, () => new THREE.Vector4()), 'vec4'),
  // Row B: (cosYaw, sinYaw, depressionAmount, bermAmount)
  brushB: uniformArray(Array.from({ length: SNOW_DEFORM_BRUSH_CAPACITY }, () => new THREE.Vector4()), 'vec4'),
  // Row C: (compression, ice, edgeRoughness, seed)
  brushC: uniformArray(Array.from({ length: SNOW_DEFORM_BRUSH_CAPACITY }, () => new THREE.Vector4()), 'vec4'),
});

/** Pure helper: snap canonical coordinate to whole deformation texels. */
export function snapDeformCenter(value) {
  return Math.round(value / SNOW_DEFORM_TEXEL_METRES) * SNOW_DEFORM_TEXEL_METRES;
}

function buildStepCompute(source, target, applyBrushes) {
  return Fn(() => {
    const n = int(SNOW_DEFORM_TEXELS);
    const ix = int(instanceIndex).mod(n);
    const iz = int(instanceIndex).div(n);
    const size = float(SNOW_DEFORM_WINDOW_METRES);
    const uv = vec2(float(ix).add(0.5), float(iz).add(0.5)).div(float(SNOW_DEFORM_TEXELS));

    // Recover canonical world position modulo window nearest to simUniforms.center.
    const base = uv.mul(size);
    const world = base.add(round(simUniforms.center.sub(base).div(size)).mul(size));
    const deltaPrev = abs(world.sub(simUniforms.prevCenter));
    const wasInside = deltaPrev.x.lessThanEqual(size.mul(0.5)).and(deltaPrev.y.lessThanEqual(size.mul(0.5)));

    const dep = float(0).toVar();
    const berm = float(0).toVar();
    const comp = float(0).toVar();
    const ice = float(0).toVar();

    If(wasInside, () => {
      const at = (dx, dz) => textureLoad(
        source,
        ivec2(ix.add(dx + SNOW_DEFORM_TEXELS).mod(n), iz.add(dz + SNOW_DEFORM_TEXELS).mod(n)),
      );
      const c = at(0, 0);
      dep.assign(c.r);
      berm.assign(c.g);
      comp.assign(c.b);
      ice.assign(c.a);

      If(simUniforms.relaxDt.greaterThan(0.001), () => {
        const xl = at(-1, 0);
        const xr = at(1, 0);
        const zd = at(0, -1);
        const zu = at(0, 1);
        const k = clamp(simUniforms.refillRate.mul(simUniforms.relaxDt), 0, 1);
        // Anisotropic diffusion: loose piled berms slump 3x faster than compacted trench floors.
        const kDep = min(float(0.20), k.mul(0.004));
        const kBerm = min(float(0.20), k.mul(0.012));
        dep.addAssign(xl.r.add(xr.r).add(zd.r).add(zu.r).sub(dep.mul(4)).mul(kDep));
        berm.addAssign(xl.g.add(xr.g).add(zd.g).add(zu.g).sub(berm.mul(4)).mul(kBerm));

        // Directional upwind snow infill along prevailing wind (weather, not isotropic blur).
        const wind = worldWindUniforms.prevailing;
        const ux = int(round(wind.x.negate().mul(1.6)));
        const uz = int(round(wind.y.negate().mul(1.6)));
        const uw = textureLoad(
          source,
          ivec2(ix.add(ux).add(SNOW_DEFORM_TEXELS).mod(n), iz.add(uz).add(SNOW_DEFORM_TEXELS).mod(n)),
        );
        const kAdv = min(float(0.18), k.mul(0.0025));
        dep.assign(mix(dep, uw.r, kAdv.mul(0.6)));
        berm.assign(mix(berm, uw.g, kAdv));

        // Mass-conserving berm-into-trench slump.
        const slump = min(berm, dep).mul(min(float(0.5), simUniforms.refillRate.mul(simUniforms.relaxDt).mul(0.0025)));
        dep.subAssign(slump);
        berm.subAssign(slump);

        // Banked exponential decay (clear of FP16 ULP quantization floor).
        const r = simUniforms.refillRate.mul(simUniforms.relaxDt);
        dep.mulAssign(exp(r.div(-360)));
        berm.mulAssign(exp(r.div(-220)));
        comp.mulAssign(exp(r.div(-280)));
        ice.mulAssign(exp(r.div(-900)));
      });
    });

    if (applyBrushes) {
      Loop(simUniforms.brushCount, ({ i }) => {
        const a = simUniforms.brushA.element(i);
        const b = simUniforms.brushB.element(i);
        const c = simUniforms.brushC.element(i);
        const radius = a.z;
        If(radius.greaterThan(0.001), () => {
          const offset = world.sub(simUniforms.center).sub(a.xy);
          const p = offset.sub(round(offset.div(size)).mul(size));
          const reach = radius.mul(max(a.w, float(1))).mul(1.65);
          If(abs(p.x).lessThanEqual(reach).and(abs(p.y).lessThanEqual(reach)), () => {
            const q = vec2(
              p.x.mul(b.x).add(p.y.mul(b.y)).div(radius.mul(max(a.w, float(0.2)))),
              p.x.negate().mul(b.y).add(p.y.mul(b.x)).div(radius),
            );
            const d = length(q);
            If(d.lessThan(1.55), () => {
              const ang = atan(q.y, q.x);
              const wob = float(1).add(c.z.mul(0.22).mul(noise2(vec2(cos(ang), sin(ang)).mul(2.7).add(c.w))));
              const dn = d.div(max(wob, float(0.5)));
              // Flat-floored boot/wake compression profile + granular displaced snow berm ring.
              const core = smoothstep(0.42, 1.0, dn).oneMinus();
              const ringD = dn.sub(1.04).mul(3.4);
              const ring = exp(ringD.mul(ringD).negate());
              const grain = float(0.72).add(noise2(q.mul(7.5).add(c.w.mul(3.1))).mul(0.5).add(0.5).mul(0.56));
              dep.addAssign(b.z.mul(core));
              berm.addAssign(b.w.mul(ring).mul(grain));
              comp.addAssign(c.x.mul(core));
              ice.assign(max(ice, c.y.mul(core)));
            });
          });
        });
      });
    }

    textureStore(
      target,
      ivec2(ix, iz),
      vec4(
        clamp(dep, 0, MAX_DEPTH_METRES),
        clamp(berm, 0, MAX_BERM_METRES),
        clamp(comp, 0, 1),
        clamp(ice, 0, 1),
      ),
    );
  })().compute(SNOW_DEFORM_TEXELS * SNOW_DEFORM_TEXELS, [64]);
}

function copyBackCompute(source, target) {
  return Fn(() => {
    const n = int(SNOW_DEFORM_TEXELS);
    const pos = ivec2(int(instanceIndex).mod(n), int(instanceIndex).div(n));
    textureStore(target, pos, textureLoad(source, pos));
  })().compute(SNOW_DEFORM_TEXELS * SNOW_DEFORM_TEXELS, [64]);
}

/**
 * Runtime controller for GPU snow deformation. Zero work on WebGL or when quiet/snowless.
 */
export class GpuSnowDeformSim {
  constructor({ renderer }) {
    this.renderer = renderer;
    this.supported = Boolean(renderer?.backend?.isWebGPUBackend);
    this.queue = [];
    this.center = null;
    this.relaxBank = 0;
    this.activeSeconds = 0;
    this.stepCompute = this.supported ? buildStepCompute(gpuSnowDeformTexture, scratchTexture, true) : null;
    this.copyCompute = this.supported ? copyBackCompute(scratchTexture, gpuSnowDeformTexture) : null;
  }

  /**
   * Queue a brush splat for this frame's compute dispatch.
   * Coordinates are canonical metres; terrain z sign follows `groundDeformationState`.
   */
  brush({
    x,
    z,
    radius = 0.24,
    elongation = 1.6,
    yaw = 0,
    depression = 0.14,
    berm = 0.08,
    compression = 0.75,
    ice = 0,
    roughness = 0.85,
    seed = Math.random() * 100,
  }) {
    if (!this.supported || !Number.isFinite(x) || !Number.isFinite(z)) return;
    if (this.queue.length >= SNOW_DEFORM_BRUSH_CAPACITY) return;
    this.queue.push({ x, z, radius, elongation, yaw, depression, berm, compression, ice, roughness, seed });
  }

  update(dtSeconds, canonicalPlayer, renderPlayer, { enabled = true, refillRate = 1 } = {}) {
    if (!this.supported || !enabled) {
      this.queue.length = 0;
      gpuSnowDeformUniforms.active.value = 0;
      return;
    }
    const dt = Math.min(Math.max(Number(dtSeconds) || 0, 0), 0.15);
    const hasBrushes = this.queue.length > 0;
    if (hasBrushes) this.activeSeconds = 420;
    else this.activeSeconds = Math.max(0, this.activeSeconds - dt);

    if (this.activeSeconds <= 0 && !hasBrushes) {
      gpuSnowDeformUniforms.active.value = 0;
      return;
    }

    const nextX = snapDeformCenter(canonicalPlayer.x);
    const nextZ = snapDeformCenter(canonicalPlayer.z);
    const prevX = this.center ? this.center.x : nextX;
    const prevZ = this.center ? this.center.z : nextZ;
    const moved = !this.center || nextX !== prevX || nextZ !== prevZ;
    this.center = { x: nextX, z: nextZ };

    // Keep wrap-space coordinates bounded near zero so float32 stays exact at Azgaar planet scale!
    const period = SNOW_DEFORM_WINDOW_METRES;
    const wrapCenterX = ((nextX % period) + period) % period;
    const wrapCenterZ = ((nextZ % period) + period) % period;
    const shiftX = nextX - prevX;
    const shiftZ = nextZ - prevZ;

    this.relaxBank += dt;
    const shouldRelax = this.relaxBank >= BANKED_RELAX_STEP_SECONDS;
    const relaxDt = shouldRelax ? this.relaxBank : 0;
    if (shouldRelax) this.relaxBank = 0;

    gpuSnowDeformUniforms.centerCanonical.value.set(wrapCenterX, wrapCenterZ);
    gpuSnowDeformUniforms.centerRender.value.set(
      renderPlayer.x + (nextX - canonicalPlayer.x),
      renderPlayer.z + (nextZ - canonicalPlayer.z),
    );
    gpuSnowDeformUniforms.active.value = 1;

    if (!hasBrushes && !moved && !shouldRelax) return;

    simUniforms.center.value.set(wrapCenterX, wrapCenterZ);
    simUniforms.prevCenter.value.set(wrapCenterX - shiftX, wrapCenterZ - shiftZ);
    simUniforms.relaxDt.value = relaxDt;
    simUniforms.refillRate.value = refillRate;
    simUniforms.brushCount.value = this.queue.length;
    for (let i = 0; i < this.queue.length; i += 1) {
      const b = this.queue[i];
      simUniforms.brushA.array[i].set(b.x - nextX, b.z - nextZ, b.radius, b.elongation);
      simUniforms.brushB.array[i].set(Math.cos(b.yaw), Math.sin(b.yaw), b.depression, b.berm);
      simUniforms.brushC.array[i].set(b.compression, b.ice, b.roughness, b.seed);
    }
    this.queue.length = 0;

    admitCompute(this.renderer, this, 'deformation', 2, true);
    this.renderer.compute(this.stepCompute);
    this.renderer.compute(this.copyCompute);
  }

  dispose() {
    this.stepCompute?.dispose?.();
    this.copyCompute?.dispose?.();
    this.queue.length = 0;
    gpuSnowDeformUniforms.active.value = 0;
  }
}
