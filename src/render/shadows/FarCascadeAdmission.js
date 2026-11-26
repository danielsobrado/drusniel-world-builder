import { PerfCounters } from '../../editor/performance/qa/PerfCounters.js';

function snapshot(camera, light, origin, revision, now) {
  const p = camera.position, q = camera.quaternion;
  const sun = light.position, target = light.target.position;
  const dx = sun.x - target.x, dy = sun.y - target.y, dz = sun.z - target.z;
  const length = Math.hypot(dx, dy, dz);
  if (!(length > 0) || !origin || !q) return null;
  const values = [p.x + origin.x, p.y, p.z + origin.z, q.x, q.y, q.z, q.w, dx / length, dy / length, dz / length];
  if (!values.every(Number.isFinite)) return null;
  return { now, camera, values, originX: origin.x, originZ: origin.z, revision,
    projection: Array.from(camera.projectionMatrix.elements), layers: camera.layers.mask };
}

function sameProjection(a, b) {
  return a.layers === b.layers && a.projection.length === b.projection.length
    && a.projection.every((value, index) => value === b.projection[index]);
}

export function farCascadeRefreshReason(previous, current, settings, pressured) {
  if (!previous || !current) return 'initial';
  if (current.camera !== previous.camera || current.revision !== previous.revision
      || current.originX !== previous.originX || current.originZ !== previous.originZ
      || !sameProjection(previous, current)) return 'invalidated';
  const a = previous.values, b = current.values;
  if (Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) > settings.farShadowMoveMeters) return 'movement';
  const cameraDot = Math.abs(a[3] * b[3] + a[4] * b[4] + a[5] * b[5] + a[6] * b[6]);
  const sunDot = a[7] * b[7] + a[8] * b[8] + a[9] * b[9];
  if (cameraDot < Math.cos(settings.farShadowTurnDegrees * Math.PI / 360)
      || sunDot < Math.cos(settings.farShadowSunDegrees * Math.PI / 180)) return 'movement';
  const interval = pressured ? settings.farShadowMaxAgeMs : settings.farShadowIntervalMs;
  return current.now < previous.now || current.now - previous.now >= interval ? 'age' : null;
}

/** Scope the far LightShadow flags to the main draw. Never change near or single shadows. */
export class FarCascadeAdmission {
  constructor(settings) {
    this.settings = settings;
    this.previous = null;
    this.pending = null;
    this.map = null;
  }

  begin(cascades, camera, light, origin, revision, now, pressured) {
    this.end(false);
    const shadow = cascades?.node?.lights?.[1]?.shadow;
    if (!shadow || !shadow.map || !shadow.autoUpdate || !camera || !light) {
      this.previous = null;
      this.map = null;
      return;
    }
    // The stock target name is shared by all cascades; label this existing map for QA.
    if (shadow.map.texture?.name === 'ShadowMap') shadow.map.texture.name = 'ShadowMapFarCascade';
    const state = snapshot(camera, light, origin, revision, now);
    const reason = shadow.needsUpdate ? 'dirty' : this.map !== shadow.map ? 'initial'
      : farCascadeRefreshReason(this.previous, state, this.settings, pressured);
    this.pending = { shadow, auto: shadow.autoUpdate, state, refresh: Boolean(reason) };
    shadow.autoUpdate = false;
    if (reason) {
      shadow.needsUpdate = true;
      PerfCounters.inc('farShadowAdmissionRefresh');
      PerfCounters.inc(`farShadowAdmissionReason.${reason}`);
    } else PerfCounters.inc('farShadowAdmissionReuse');
    PerfCounters.set('farShadowAdmissionAgeMs', this.previous ? Math.max(0, now - this.previous.now) : 0);
  }

  end(completed = true) {
    const pending = this.pending;
    if (!pending) return;
    this.pending = null;
    const { shadow, state, refresh } = pending;
    shadow.autoUpdate = pending.auto;
    // r187 clears needsUpdate only after ShadowNode.updateShadow returns.
    if (completed && refresh && !shadow.needsUpdate && shadow.map && state) {
      this.previous = state;
      this.map = shadow.map;
    } else if (!completed || refresh) {
      this.previous = null;
      this.map = null;
      shadow.needsUpdate = true;
    }
  }

  dispose() { this.end(false); this.previous = null; this.map = null; }
}
