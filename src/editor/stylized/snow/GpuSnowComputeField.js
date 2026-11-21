import * as THREE from 'three/webgpu';
import {
  Fn, If, abs, atan, cameraPosition, cameraWorldMatrix, clamp, cos, dot, float, floor, fract, hash, instancedArray,
  instanceIndex, length, max, mix, normalize, positionGeometry, positionWorld, select, sin, smoothstep, texture,
  time as globalTime, uv, vec2, vec3, vec4,
} from 'three/tsl';
import { frameUniform } from '../../../render/FrameUniforms.js';
import { worldWindUniforms } from '../../weather/wind/worldWindState.js';
import { noise2 } from '../SnowNoiseNodes.js';
import { snowLightUniforms } from '../sky/skyLight.js';

/**
 * WebGPU Compute High-Mountain Snow & Billowing Ground-Spindrift Engine
 * (reallocated from the idle high-mountain grass budget; 0 dispatches & 0 draws
 * outside snow country, zero CPU per-particle loops, zero runtime readbacks).
 *
 * Combines WebGPU StorageBuffer particle physics (curl-noise wind eddies,
 * LocalGroundHeight saltation/ridge-hugging, player wake vortex) with
 * Noniv/snowflow_demo's `spray.fragment.wgsl` shading (MIT):
 *  - Per-particle angular silhouette wobble (eliminates round-sprite tells)
 *  - Reconstructed 3D spherical billboard normal
 *  - Wrapped diffuse (0.75) + calibrated Cornette-Shanks Mie forward scatter
 *  - Three unified species: billowing ground-hugging spindrift puffs/snow smoke,
 *    glittering diamond-dust ice crystals, and turbulent swirling snow clods.
 */

export const GPU_SNOW_PARTICLE_COUNT = 16384;
const BOX_EXTENT = 44;
const BOX_HEIGHT = 18;
const MIE_G = 0.55;
const TWO_PI = Math.PI * 2;

function cornetteShanks(mu) {
  const g2 = MIE_G * MIE_G;
  return mu.mul(mu).add(1).mul((3 / (8 * Math.PI)) * (1 - g2) / (2 + g2))
    .div(mu.mul(-2 * MIE_G).add(1 + g2).pow(1.5));
}

export class GpuSnowComputeField {
  constructor({ renderer, ground, light, sun, puffTexture, count = GPU_SNOW_PARTICLE_COUNT }) {
    this.name = 'gpu-snow-compute';
    this.renderer = renderer;
    this.supported = Boolean(renderer?.backend?.isWebGPUBackend);
    this.ground = ground;
    this.count = count;
    this.initialized = false;
    this.current = 0;
    this.lastPlayerPos = null;
    this.playerVelScratch = new THREE.Vector3();

    this.uniforms = {
      intensity: frameUniform(0),
      stormBoost: frameUniform(0),
      dt: frameUniform(0.016),
      focus: frameUniform(new THREE.Vector3()),
      shift: frameUniform(new THREE.Vector3()),
      wind: frameUniform(new THREE.Vector3(2.5, 0, 1.2)),
      playerPos: frameUniform(new THREE.Vector3(0, -1e5, 0)),
      playerVel: frameUniform(new THREE.Vector3()),
    };

    // Two GPU StorageBuffers: pos (xyz render-relative to focus, w age 0..1), vel (xyz m/s, w speciesSeed 0..1).
    this.posBuffer = instancedArray(count, 'vec4');
    this.velBuffer = instancedArray(count, 'vec4');

    this.initCompute = this.supported ? this.buildInitCompute() : null;
    this.stepCompute = this.supported ? this.buildStepCompute(ground) : null;

    this.geometry = new THREE.PlaneGeometry(1, 1);
    this.material = this.createMaterial({ light, sun, puffTexture });
    this.mesh = new THREE.InstancedMesh(this.geometry, this.material, count);
    this.mesh.name = 'gpu-snow-compute-field';
    const identity = new THREE.Matrix4();
    for (let i = 0; i < count; i += 1) this.mesh.setMatrixAt(i, identity);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.mesh.renderOrder = 6;
  }

  buildInitCompute() {
    const posBuf = this.posBuffer;
    const velBuf = this.velBuffer;
    return Fn(() => {
      const idx = instanceIndex.toFloat();
      const rx = hash(idx.add(11.31)).sub(0.5).mul(BOX_EXTENT);
      const rz = hash(idx.add(57.17)).sub(0.5).mul(BOX_EXTENT);
      const species = hash(idx.add(91.73));
      const ry = species.lessThan(0.28)
        .select(hash(idx.add(23.91)).pow(2.0).mul(1.8), hash(idx.add(23.91)).mul(BOX_HEIGHT).sub(2.0));
      const age = hash(idx.add(131.07));
      posBuf.element(instanceIndex).assign(vec4(rx, ry, rz, age));
      velBuf.element(instanceIndex).assign(vec4(0, -0.8, 0, species));
    })().compute(this.count, [64]);
  }

  buildStepCompute(ground) {
    const posBuf = this.posBuffer;
    const velBuf = this.velBuffer;
    const u = this.uniforms;
    const halfBox = float(BOX_EXTENT * 0.5);
    return Fn(() => {
      const idx = instanceIndex.toFloat();
      const p = posBuf.element(instanceIndex).toVar();
      const v = velBuf.element(instanceIndex).toVar();
      const species = v.w;
      const isSpindrift = species.lessThan(0.28);
      const isDiamond = species.greaterThanEqual(0.28).and(species.lessThan(0.54));

      // Shift particle position opposite camera motion so particles live in world space on a camera torus.
      p.xyz.subAssign(u.shift);

      // 3D divergence-free curl-like wind turbulence from world-anchored phase.
      const worldP = u.focus.add(p.xyz);
      const t = globalTime;
      const phase = worldP.mul(0.14).add(vec3(t.mul(0.45), t.mul(0.22), t.mul(0.38)));
      const eddy = vec3(
        sin(phase.y.mul(1.7).add(phase.z)).mul(cos(phase.x.mul(0.9))),
        sin(phase.x.mul(1.3).sub(phase.z.mul(1.1))).mul(0.45),
        cos(phase.y.mul(1.5).sub(phase.x)).mul(sin(phase.z.mul(0.8))),
      );

      // Target velocity per species: spindrift races along ground wind; diamond dust drifts slowly; flakes swirl.
      const windSpeedScale = select(isSpindrift, float(1.45), select(isDiamond, float(0.35), float(0.95)));
      const fallSpeed = select(isSpindrift, float(-0.18), select(isDiamond, float(-0.12), float(-1.35).sub(u.stormBoost.mul(0.9))));
      const gustScale = float(1.1).add(u.stormBoost.mul(2.1));
      const targetVel = vec3(
        u.wind.x.mul(windSpeedScale).add(eddy.x.mul(gustScale)),
        fallSpeed.add(eddy.y.mul(gustScale)),
        u.wind.z.mul(windSpeedScale).add(eddy.z.mul(gustScale)),
      );
      v.xyz.assign(mix(v.xyz, targetVel, clamp(u.dt.mul(3.2), 0, 1)));

      // Player wake impulse: running or jumping through snow swirls nearby powder outward & upward!
      const toPart = worldP.sub(u.playerPos);
      const playerDist = length(toPart);
      const playerSpeed = length(u.playerVel);
      If(playerDist.lessThan(3.8).and(playerSpeed.greaterThan(0.6)), () => {
        const push = smoothstep(3.8, 0.3, playerDist).mul(clamp(playerSpeed.mul(0.35), 0, 2.2));
        const radial = normalize(vec3(toPart.x, float(0.45), toPart.z).add(vec3(1e-4, 0, 0)));
        v.xyz.addAssign(radial.mul(push.mul(2.6)).add(u.playerVel.mul(push.mul(0.45))));
      });

      p.xyz.addAssign(v.xyz.mul(u.dt));

      // Toroidal XZ wrap around focus.
      p.x.assign(fract(p.x.add(halfBox).div(BOX_EXTENT)).mul(BOX_EXTENT).sub(halfBox));
      p.z.assign(fract(p.z.add(halfBox).div(BOX_EXTENT)).mul(BOX_EXTENT).sub(halfBox));

      // Sample LocalGroundHeight directly in compute: spindrift hugs ridges; flakes bounce/saltate!
      const wx = u.focus.x.add(p.x);
      const wz = u.focus.z.add(p.z);
      const groundY = ground.heightNode(wx, wz);
      const relGround = groundY.sub(u.focus.y);

      If(isSpindrift, () => {
        // Billowing ground-hugging snow puffs skim 0.12..1.85 m above terrain & curl up slopes.
        const maxH = float(1.75).add(u.stormBoost.mul(1.2));
        const minH = float(0.12);
        const hAbove = p.y.sub(relGround);
        If(hAbove.lessThan(minH), () => {
          p.y.assign(relGround.add(minH));
          v.y.assign(max(v.y, float(0.35).add(hash(idx.add(t)).mul(0.5))));
        });
        If(hAbove.greaterThan(maxH), () => {
          p.y.assign(relGround.add(minH).add(hash(idx.add(37.1)).mul(0.6)));
        });
      }).Else(() => {
        // Falling flakes & diamond dust saltate off snow or respawn cleanly at top of volume.
        If(p.y.lessThan(relGround.add(0.06)), () => {
          const bounce = hash(idx.add(floor(t.mul(4)))).greaterThan(0.55);
          If(bounce, () => {
            p.y.assign(relGround.add(0.08));
            v.y.assign(float(0.65).add(u.stormBoost.mul(0.8)));
          }).Else(() => {
            p.y.assign(relGround.add(BOX_HEIGHT).sub(hash(idx.add(71.3)).mul(3.0)));
          });
        });
        If(p.y.greaterThan(relGround.add(BOX_HEIGHT + 4)), () => {
          p.y.assign(relGround.add(BOX_HEIGHT));
        });
      });

      p.w.assign(fract(p.w.add(u.dt.mul(select(isSpindrift, float(0.24), float(0.16))))));
      posBuf.element(instanceIndex).assign(p);
      velBuf.element(instanceIndex).assign(v);
    })().compute(this.count, [64]);
  }

  createMaterial({ light, sun, puffTexture }) {
    const posNode = this.posBuffer.element(instanceIndex);
    const velNode = this.velBuffer.element(instanceIndex);
    const species = velNode.w;
    const isSpindrift = species.lessThan(0.28);
    const isDiamond = species.greaterThanEqual(0.28).and(species.lessThan(0.54));
    const seed = fract(species.mul(37.13));

    const center = this.uniforms.focus.add(posNode.xyz);
    const edge = max(abs(posNode.x), abs(posNode.z)).div(float(BOX_EXTENT * 0.5));
    const edgeFade = smoothstep(0.68, 0.98, edge).oneMinus();
    const lifeFade = smoothstep(0, 0.14, posNode.w).mul(smoothstep(0.82, 1.0, posNode.w).oneMinus());
    // Active particle share scales cleanly with intensity + stormBoost (count culling via 0-size collapse).
    const activeCutoff = mix(float(0.45), float(1.0), max(this.uniforms.intensity, this.uniforms.stormBoost));
    const alive = select(fract(species.mul(13.7)).lessThan(activeCutoff), float(1), float(0));

    // Size per species: billowing spindrift puffs (0.55..1.85 m), crisp diamond dust (2..4 cm), flakes/clods (3..8 cm).
    const puffSize = mix(float(0.55), float(1.85), seed).mul(float(1).add(this.uniforms.stormBoost.mul(0.45)));
    const crystalSize = mix(float(0.018), float(0.038), seed);
    const flakeSize = mix(float(0.032), float(0.085), seed);
    const baseSize = select(isSpindrift, puffSize, select(isDiamond, crystalSize, flakeSize));
    const size = baseSize.mul(alive).mul(edgeFade.greaterThan(0.01).select(float(1), float(0)));

    const right = cameraWorldMatrix.element(0).xyz;
    const up = cameraWorldMatrix.element(1).xyz;
    const spin = seed.mul(TWO_PI).add(posNode.w.mul(select(isSpindrift, float(1.4), float(4.2))));
    const corner = positionGeometry.xy;
    const rx = corner.x.mul(cos(spin)).sub(corner.y.mul(sin(spin)));
    const ry = corner.x.mul(sin(spin)).add(corner.y.mul(cos(spin)));
    const aspect = select(isSpindrift, float(1.35), float(1.0));

    const material = new THREE.MeshBasicNodeMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      forceSinglePass: true,
    });
    material.name = 'gpu-snow-compute-field';
    material.positionNode = center.add(right.mul(rx.mul(size).mul(aspect))).add(up.mul(ry.mul(size)));

    // Snowflow `spray.fragment.wgsl` shading: angular silhouette wobble + spherical 3D normal + Mie scatter!
    const local = uv().sub(0.5).mul(2);
    const r2 = dot(local, local);
    const ang = atan(local.y, local.x);
    const wob = float(1).add(noise2(vec2(cos(ang), sin(ang)).mul(2.4).add(seed.mul(37.0))).mul(0.32));
    const r = r2.sqrt().div(max(wob, float(0.5)));

    // Soft textured billowing veil for spindrift puffs; sharp twinkling star for diamond dust; crisp clod for flakes.
    const puffTap = texture(puffTexture, uv());
    const variant = floor(seed.mul(4));
    const puffDensity = variant.lessThan(1).select(puffTap.r, variant.lessThan(2).select(puffTap.g,
      variant.lessThan(3).select(puffTap.b, puffTap.a)));
    const softPuff = puffDensity.mul(smoothstep(0.95, 0.22, r)).mul(0.10);
    const twinkle = sin(globalTime.mul(4.5).add(seed.mul(TWO_PI))).mul(0.5).add(0.5).pow(5).mul(0.85).add(0.15);
    const diamondAlpha = smoothstep(0.95, 0.15, r).pow(2.4).mul(twinkle).mul(0.85);
    const clodAlpha = smoothstep(1.0, 0.55, r).mul(0.62);
    const shapeAlpha = select(isSpindrift, softPuff, select(isDiamond, diamondAlpha, clodAlpha));

    const V = normalize(cameraPosition.sub(positionWorld));
    const nz = max(float(0), float(1).sub(clamp(r2, 0, 1))).sqrt();
    const sphereN = normalize(right.mul(local.x).add(up.mul(local.y)).add(V.mul(nz)));

    // Multiple-scattering snow cloud lighting: omnidirectional base + wrapped 3D shading + Mie forward scatter
    // so spindrift veils stay crisp sunlit snow-white from every angle (never dark smoke).
    const wrap = max(dot(sphereN, sun).add(0.85).div(1.85), float(0));
    const diff = float(0.68).add(wrap.mul(0.36));
    const mu = dot(V.negate(), sun);
    const fwd = cornetteShanks(mu).mul(select(isSpindrift, float(0.85), float(1.45)));
    const albedo = select(isDiamond, vec3(0.99, 1.0, 1.0), vec3(0.95, 0.97, 1.0))
      .mul(snowLightUniforms.brightness.max(0.92));
    // light.sun & light.sky already encode sky brightness & 1/pi radiance scaling.
    const lit = albedo.mul(light.sun.mul(diff.add(fwd)).add(light.sky.mul(1.45)));

    const viewDist = cameraPosition.distance(positionWorld);
    const nearFade = smoothstep(select(isSpindrift, float(2.2), float(0.45)), select(isSpindrift, float(5.5), float(1.2)), viewDist);

    material.colorNode = lit;
    material.opacityNode = shapeAlpha.mul(edgeFade).mul(lifeFade).mul(nearFade).mul(this.uniforms.intensity);
    return material;
  }

  update(delta, state) {
    if (!this.supported) return;
    const { focus, weights, windiness, axis, step, player } = state;
    const snowWeight = Math.max(0, Math.min(1, Number(weights?.snow) || 0));
    const target = snowWeight > 0.12 ? Math.min(1, snowWeight * (0.55 + Math.min(1, windiness * 0.45))) : 0;
    const next = step ? step(this.current, target) : target;
    this.current = next < 0.006 ? 0 : next;
    this.uniforms.intensity.value = this.current;
    this.mesh.visible = this.current > 0 && this.ground.ready;
    if (!this.mesh.visible) return;

    const dt = Math.min(Math.max(Number(delta) || 0.016, 0.001), 0.08);
    this.uniforms.dt.value = dt;
    this.uniforms.stormBoost.value = Math.max(0, Math.min(1, (windiness - 0.8) * 0.7));

    if (!this.initialized) {
      this.uniforms.focus.value.set(focus.x, focus.y, focus.z);
      this.uniforms.shift.value.set(0, 0, 0);
      this.renderer.compute(this.initCompute);
      this.initialized = true;
    } else {
      const prev = this.uniforms.focus.value;
      this.uniforms.shift.value.set(focus.x - prev.x, focus.y - prev.y, focus.z - prev.z);
      prev.set(focus.x, focus.y, focus.z);
    }

    const wx = worldWindUniforms.prevailing.value.x;
    const wz = worldWindUniforms.prevailing.value.y;
    const speed = 2.4 * Math.max(0.4, windiness);
    const dirX = axis ? axis.x : wx;
    const dirZ = axis ? axis.z : wz;
    this.uniforms.wind.value.set(dirX * speed, 0, dirZ * speed);

    if (player?.position) {
      const px = player.position.x;
      const py = player.position.y;
      const pz = player.position.z;
      if (this.lastPlayerPos) {
        this.playerVelScratch.set(
          (px - this.lastPlayerPos.x) / dt,
          (py - this.lastPlayerPos.y) / dt,
          (pz - this.lastPlayerPos.z) / dt,
        );
        this.uniforms.playerVel.value.copy(this.playerVelScratch);
      }
      this.lastPlayerPos = this.lastPlayerPos ?? new THREE.Vector3();
      this.lastPlayerPos.set(px, py, pz);
      this.uniforms.playerPos.value.set(px, py, pz);
    }

    this.renderer.compute(this.stepCompute);
  }

  shiftWorld(shiftX, shiftZ) {
    this.uniforms.focus.value.x -= shiftX;
    this.uniforms.focus.value.z -= shiftZ;
    if (this.lastPlayerPos) {
      this.lastPlayerPos.x -= shiftX;
      this.lastPlayerPos.z -= shiftZ;
    }
  }

  getState() {
    return {
      supported: this.supported,
      intensity: Number(this.current.toFixed(3)),
      count: this.count,
      visible: this.mesh.visible,
    };
  }

  dispose() {
    this.initCompute?.dispose?.();
    this.stepCompute?.dispose?.();
    this.mesh.removeFromParent();
    this.geometry.dispose();
    this.material.dispose();
  }
}
