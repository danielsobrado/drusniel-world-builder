import {
  coastalImpactTexture, coastalImpactUniforms, clearCoastalImpactTexture, IMPACT_FIELD_RESOLUTION,
} from '../stylized/CoastalRockImpactStateNodes.js';

const CHANNELS = 4;
const MAX_STEP_SECONDS = 0.25;

function byte(value) {
  return Math.round(Math.max(0, Math.min(1, value)) * 255);
}

export class CoastalRockImpactField {
  constructor(floatingOrigin, config) {
    this.floatingOrigin = floatingOrigin;
    this.config = config;
    this.size = IMPACT_FIELD_RESOLUTION;
    this.span = config.field.spanMeters;
    this.texel = this.span / this.size;
    this.originX = NaN;
    this.originZ = NaN;
    this.lastTime = null;
    this.accumulator = 0;
    this.enabled = false;
    this.data = coastalImpactTexture.image.data;
    this.precise = new Float32Array(this.data.length);
    clearCoastalImpactTexture();
    coastalImpactUniforms.inverseSpan.value = 1 / this.span;
    coastalImpactUniforms.fadeFraction.value = config.field.boundaryFadeMeters / this.span;
  }

  center(camera) {
    const cameraWorld = this.floatingOrigin.toCanonical(camera.position.x, camera.position.z);
    const nextX = Math.floor((cameraWorld.x - this.span * 0.5) / this.config.field.scrollMeters)
      * this.config.field.scrollMeters;
    const nextZ = Math.floor((cameraWorld.z - this.span * 0.5) / this.config.field.scrollMeters)
      * this.config.field.scrollMeters;
    if (nextX !== this.originX || nextZ !== this.originZ) this.scroll(nextX, nextZ);
    const render = this.floatingOrigin.toRender(this.originX, this.originZ);
    coastalImpactUniforms.renderOrigin.value.set(render.x, render.z);
    coastalImpactUniforms.active.value = 1;
    this.enabled = true;
  }

  scroll(nextX, nextZ) {
    const shiftX = Number.isFinite(this.originX) ? Math.round((nextX - this.originX) / this.texel) : this.size;
    const shiftZ = Number.isFinite(this.originZ) ? Math.round((nextZ - this.originZ) / this.texel) : this.size;
    const old = this.data;
    const updated = new Uint8Array(old.length);
    const updatedPrecise = new Float32Array(old.length);
    if (Math.abs(shiftX) < this.size && Math.abs(shiftZ) < this.size) {
      for (let z = 0; z < this.size; z++) {
        const sourceZ = z + shiftZ;
        if (sourceZ < 0 || sourceZ >= this.size) continue;
        for (let x = 0; x < this.size; x++) {
          const sourceX = x + shiftX;
          if (sourceX < 0 || sourceX >= this.size) continue;
          const target = (z * this.size + x) * CHANNELS;
          const from = (sourceZ * this.size + sourceX) * CHANNELS;
          updated.set(old.subarray(from, from + CHANNELS), target);
          updatedPrecise.set(this.precise.subarray(from, from + CHANNELS), target);
        }
      }
    }
    this.originX = nextX;
    this.originZ = nextZ;
    this.data = updated;
    this.precise = updatedPrecise;
    coastalImpactTexture.image.data = updated;
    coastalImpactTexture.needsUpdate = true;
  }

  tick(time) {
    if (!Number.isFinite(time)) return;
    if (this.lastTime === null || time < this.lastTime || time - this.lastTime > 0.5) {
      this.lastTime = time;
      this.accumulator = 0;
      return;
    }
    this.accumulator += time - this.lastTime;
    this.lastTime = time;
    const period = 1 / this.config.field.updateHz;
    if (this.accumulator + 1e-7 < period) return;
    const dt = Math.min(this.accumulator, MAX_STEP_SECONDS);
    this.accumulator = 0;
    const data = this.data;
    const precise = this.precise;
    const foam = Math.exp(-dt / this.config.foam.decaySeconds);
    const damp = Math.exp(-dt / this.config.wetness.decaySeconds);
    const runoff = Math.exp(-dt / this.config.wetness.runoffSeconds);
    const pulse = Math.exp(-dt / 0.5);
    let changed = false;
    for (let offset = 0; offset < data.length; offset += CHANNELS) {
      precise[offset] *= foam;
      precise[offset + 1] *= damp;
      precise[offset + 2] *= runoff;
      precise[offset + 3] *= pulse;
      const nextR = byte(precise[offset]);
      const nextG = byte(precise[offset + 1]);
      const nextB = byte(precise[offset + 2]);
      const nextA = byte(precise[offset + 3]);
      if (nextR !== data[offset] || nextG !== data[offset + 1]
        || nextB !== data[offset + 2] || nextA !== data[offset + 3]) changed = true;
      data[offset] = nextR;
      data[offset + 1] = nextG;
      data[offset + 2] = nextB;
      data[offset + 3] = nextA;
    }
    if (changed) coastalImpactTexture.needsUpdate = true;
  }

  stamp(event, strength = event.intensity) {
    if (!this.enabled || strength <= 0) return;
    const radius = Math.max(0.15, event.radius);
    const width = this.config.foam.widthMeters;
    const reach = Math.min(radius * 6, this.config.contactReachMeters + radius * 5);
    const extent = radius + width * 2 + reach;
    const minX = Math.max(0, Math.floor((event.x - extent - this.originX) / this.texel));
    const maxX = Math.min(this.size - 1, Math.ceil((event.x + extent - this.originX) / this.texel));
    const minZ = Math.max(0, Math.floor((event.z - extent - this.originZ) / this.texel));
    const maxZ = Math.min(this.size - 1, Math.ceil((event.z + extent - this.originZ) / this.texel));
    if (minX > maxX || minZ > maxZ) return;
    const data = this.data;
    const precise = this.precise;
    const dx = event.directionX, dz = event.directionZ;
    for (let z = minZ; z <= maxZ; z++) {
      const wz = this.originZ + (z + 0.5) * this.texel - event.z;
      for (let x = minX; x <= maxX; x++) {
        const wx = this.originX + (x + 0.5) * this.texel - event.x;
        const distance = Math.hypot(wx, wz);
        const rim = Math.exp(-Math.pow((distance - radius) / width, 2));
        const windward = 0.3 + 0.7 * Math.max(0, -(wx * dx + wz * dz) / Math.max(distance, 0.001));
        const along = wx * dx + wz * dz;
        const across = -wx * dz + wz * dx;
        const wake = Math.max(0, Math.min(1, (along - radius) / Math.max(radius, 0.2)))
          * Math.exp(-Math.pow(across / (radius * 0.8 + 0.15), 2))
          * Math.max(0, 1 - along / Math.max(reach, radius * 2));
        const contact = rim * windward;
        const foam = Math.min(1, strength * (contact + this.config.foam.wakeStrength * wake));
        const moisture = Math.min(1, strength * Math.exp(-Math.pow(distance / Math.max(radius * 1.25, 0.35), 2)));
        const offset = (z * this.size + x) * CHANNELS;
        precise[offset] = Math.min(1, precise[offset] + foam * this.config.foam.strength);
        precise[offset + 1] = Math.max(precise[offset + 1], moisture);
        precise[offset + 2] = Math.max(precise[offset + 2], moisture * 0.7);
        precise[offset + 3] = Math.max(precise[offset + 3], contact * strength);
        data[offset] = byte(precise[offset]);
        data[offset + 1] = byte(precise[offset + 1]);
        data[offset + 2] = byte(precise[offset + 2]);
        data[offset + 3] = byte(precise[offset + 3]);
      }
    }
    coastalImpactTexture.needsUpdate = true;
  }

  reset() {
    this.precise.fill(0);
    this.data.fill(0);
    coastalImpactTexture.needsUpdate = true;
    this.lastTime = null;
    this.accumulator = 0;
  }

  disable() {
    this.enabled = false;
    coastalImpactUniforms.active.value = 0;
    this.lastTime = null;
  }

  dispose() {
    this.disable();
    clearCoastalImpactTexture();
  }
}
