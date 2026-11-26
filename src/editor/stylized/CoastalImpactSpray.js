import * as THREE from 'three/webgpu';
import {
  attribute, cameraWorldMatrix, color, max, mix, oneMinus, positionGeometry,
  smoothstep, uv, vec3,
} from 'three/tsl';
import { frameUniform } from '../../render/FrameUniforms.js';
import { impactDroplet, impactHash } from '../water/CoastalRockImpactMath.js';
import { markAttributeSubrangeUpdated } from './attributeUpload.js';
import { compactLiveSpray } from './CoastalSprayRecords.js';
import { PerfCounters } from '../performance/qa/PerfCounters.js';

function createSprayMaterial(clock, alphaCutoff) {
  const spawn = attribute('impactSpawn', 'vec4');
  const velocity = attribute('impactVelocity', 'vec4');
  const style = attribute('impactStyle', 'vec4');
  const age = clock.sub(spawn.w);
  const duration = max(velocity.w, 0.01);
  const elapsed = age.max(0).min(duration);
  const center = vec3(
    spawn.x.add(velocity.x.mul(elapsed)),
    spawn.y.add(velocity.y.mul(elapsed)).sub(elapsed.mul(elapsed).mul(4.905)),
    spawn.z.add(velocity.z.mul(elapsed)),
  );
  const right = cameraWorldMatrix.element(0).xyz;
  const up = cameraWorldMatrix.element(1).xyz;
  const material = new THREE.MeshBasicNodeMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true,
  });
  material.name = 'coastal-impact-droplets';
  material.fog = true;
  material.positionNode = center
    .add(right.mul(positionGeometry.x.mul(style.x)))
    .add(up.mul(positionGeometry.y.mul(style.x)));
  const circular = oneMinus(smoothstep(0.45, 1, uv().sub(0.5).mul(2).length()));
  const life = smoothstep(0, 0.07, age)
    .mul(oneMinus(smoothstep(0.7, 1, age.div(duration))));
  material.opacityNode = circular.mul(style.y).mul(life);
  if (alphaCutoff > 0) material.maskNode = material.opacityNode.greaterThan(alphaCutoff);
  material.colorNode = mix(color('#e4f6ff'), color('#c0dce8'), style.z);
  return material;
}

function makeAttribute(data) {
  // Emission and rebasing mark writes. DynamicDrawUsage uploads even without a new version.
  return new THREE.InstancedBufferAttribute(data, 4);
}

export class CoastalImpactSpray {
  constructor({ scene, floatingOrigin, settings, qualityTier, compact = false, alphaCutoff = 0 }) {
    this.floatingOrigin = floatingOrigin;
    this.settings = settings;
    this.capacity = qualityTier === 'ultra'
      ? settings.ultraMaxDroplets : qualityTier === 'high' ? settings.highMaxDroplets : 0;
    this.mistCapacity = qualityTier === 'ultra'
      ? settings.ultraMaxMist : qualityTier === 'high' ? settings.highMaxMist : 0;
    this.time = frameUniform(0);
    this.compact = compact;
    this.records = compact ? [] : Array.from({ length: this.capacity }, () => null);
    this.dirtyMin = Infinity;
    this.dirtyMax = -1;
    this.preparedTime = null;
    this.cursor = 0;
    this.live = 0;
    this.lastOriginX = NaN;
    this.lastOriginZ = NaN;
    if (!this.capacity) return;
    const plane = new THREE.PlaneGeometry(1, 1);
    this.geometry = new THREE.InstancedBufferGeometry();
    this.geometry.index = plane.index.clone();
    this.geometry.setAttribute('position', plane.getAttribute('position').clone());
    this.geometry.setAttribute('uv', plane.getAttribute('uv').clone());
    plane.dispose();
    this.spawn = makeAttribute(new Float32Array(this.capacity * 4));
    this.velocity = makeAttribute(new Float32Array(this.capacity * 4));
    this.style = makeAttribute(new Float32Array(this.capacity * 4));
    this.geometry.setAttribute('impactSpawn', this.spawn);
    this.geometry.setAttribute('impactVelocity', this.velocity);
    this.geometry.setAttribute('impactStyle', this.style);
    this.geometry.instanceCount = 0;
    this.material = createSprayMaterial(this.time, alphaCutoff);
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.name = 'coastal-rock-impact-spray';
    this.mesh.renderOrder = 3;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.mesh.userData.excludeFromReflection = true;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  place(index, particle) {
    const render = this.floatingOrigin.toRender(particle.x, particle.z);
    this.spawn.setXYZW(index, render.x, particle.y, render.z, particle.birth);
    this.velocity.setXYZW(index, particle.vx, particle.vy, particle.vz, particle.life);
    this.style.setXYZW(index, particle.size, particle.opacity, particle.mist ? 1 : 0, 0);
    if (this.compact) {
      this.dirtyMin = Math.min(this.dirtyMin, index);
      this.dirtyMax = Math.max(this.dirtyMax, index);
    } else {
      this.spawn.needsUpdate = true;
      this.velocity.needsUpdate = true;
      this.style.needsUpdate = true;
    }
  }

  /** Retire expired records before emission so their slots are immediately reusable. */
  beginFrame(time) {
    if (!this.compact || !this.capacity) return;
    const origin = this.floatingOrigin.getState();
    const rebased = origin.x !== this.lastOriginX || origin.z !== this.lastOriginZ;
    if (time === this.preparedTime && !rebased) return;
    const before = this.records.length;
    const result = compactLiveSpray(this.records, time, (index, record) => this.place(index, record), rebased);
    this.live = result.live;
    this.mistLive = result.mist;
    this.lastOriginX = origin.x;
    this.lastOriginZ = origin.z;
    this.preparedTime = time;
    PerfCounters.inc('coastalSprayExpiredRecords', before - result.live);
    PerfCounters.inc('coastalSprayCompactedRows', result.written);
  }

  emit(event, time) {
    if (!this.capacity || event.intensity < this.settings.minimumIntensity) return 0;
    this.beginFrame(time);
    const count = Math.round(4 + event.intensity * 20);
    const mistCount = event.intensity >= 0.55 ? Math.round((event.intensity - 0.45) * 9) : 0;
    let emitted = 0;
    let emittedMist = 0;
    for (let n = 0; n < count + mistCount; n++) {
      const index = this.compact ? this.records.length : this.cursor;
      if (index >= this.capacity) break;
      const occupied = this.records[index];
      if (occupied && time < occupied.birth + occupied.life) break;
      const mist = n >= count;
      if (mist && (this.mistLive ?? 0) + emittedMist >= this.mistCapacity) break;
      const motion = impactDroplet(event, n, this.settings);
      const lateral = impactHash(event.rockId, event.crestId, n + 919) - 0.5;
      const particle = {
        x: event.contactX + lateral * event.radius * 0.35,
        z: event.contactZ + lateral * event.radius * 0.22,
        y: event.contactY + 0.05,
        birth: time, ...motion,
        mist,
      };
      if (mist) {
        particle.life = this.settings.mistLifetimeMin
          + (this.settings.mistLifetimeMax - this.settings.mistLifetimeMin) * lateral * lateral * 4;
        particle.size = 0.14 + 0.25 * Math.abs(lateral);
        particle.opacity = 0.08 + 0.12 * event.intensity;
        particle.vx *= 0.3;
        particle.vz *= 0.3;
        particle.vy *= 0.5;
        emittedMist++;
      }
      this.records[index] = particle;
      this.place(index, particle);
      if (!this.compact) this.cursor = (index + 1) % this.capacity;
      emitted++;
    }
    if (emitted > 0) {
      this.geometry.instanceCount = this.compact ? this.records.length : Math.min(this.capacity, this.geometry.instanceCount + emitted);
      this.mesh.visible = true;
    }
    this.lastEmittedMist = emittedMist;
    this.mistLive = (this.mistLive ?? 0) + emittedMist;
    return emitted;
  }

  update(time) {
    if (!this.capacity) return;
    this.time.value = time;
    if (this.compact) {
      this.beginFrame(time);
      const max = Math.min(this.dirtyMax, this.records.length - 1);
      for (const attribute of [this.spawn, this.velocity, this.style]) {
        markAttributeSubrangeUpdated(attribute, this.dirtyMin, max, { counter: 'coastalSprayAttributeBytes' });
      }
      this.dirtyMin = Infinity;
      this.dirtyMax = -1;
      this.live = this.records.length;
      this.geometry.instanceCount = this.live;
      this.mesh.visible = this.live > 0;
      PerfCounters.set('coastalSpraySubmittedInstances', this.live);
      PerfCounters.set('coastalSprayAllocatedInstances', this.capacity);
      return;
    }
    const origin = this.floatingOrigin.getState();
    if (origin.x !== this.lastOriginX || origin.z !== this.lastOriginZ) {
      for (let i = 0; i < this.records.length; i++) {
        const p = this.records[i];
        if (p && time < p.birth + p.life) this.place(i, p);
      }
      this.lastOriginX = origin.x;
      this.lastOriginZ = origin.z;
    }
    let live = 0;
    let mistLive = 0;
    for (const record of this.records) {
      if (record && time >= record.birth && time < record.birth + record.life) {
        live++;
        if (record.mist) mistLive++;
      }
    }
    this.live = live;
    this.mistLive = mistLive;
    this.mesh.visible = live > 0;
  }

  reset() {
    if (!this.capacity) return;
    if (this.compact) this.records.length = 0;
    else this.records.fill(null);
    this.preparedTime = null;
    this.dirtyMin = Infinity;
    this.dirtyMax = -1;
    this.cursor = 0;
    this.live = 0;
    this.mistLive = 0;
    this.geometry.instanceCount = 0;
    this.mesh.visible = false;
  }

  dispose() {
    this.mesh?.removeFromParent();
    this.geometry?.dispose();
    this.material?.dispose();
    this.records.length = 0;
  }
}
