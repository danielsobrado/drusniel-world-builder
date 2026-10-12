/**
 * A moving point that recipes hang visuals on: a fireball, a magic missile,
 * a meteor. Paths are evaluated analytically so frame rate never changes the
 * trajectory; terrain contact ends the flight early.
 */

function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** Cubic Bézier through two control points. */
function bezier(p0, p1, p2, p3, t, target) {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  target.x = p0.x * a + p1.x * b + p2.x * c + p3.x * d;
  target.y = p0.y * a + p1.y * b + p2.y * c + p3.y * d;
  target.z = p0.z * a + p1.z * b + p2.z * c + p3.z * d;
  return target;
}

/**
 * @param {object} spec
 * @param {{x,y,z}} spec.from
 * @param {{x,y,z}} spec.to
 * @param {number} spec.speed metres per second along the chord
 * @param {'straight'|'arc'|'curve'} [spec.path]
 * @param {number} [spec.arc] apex height as a fraction of distance ('arc')
 * @param {{x,y,z}} [spec.bend1] first control-point offset ('curve')
 * @param {{x,y,z}} [spec.bend2] second control-point offset ('curve')
 * @param {(position, direction, dt, t) => void} [spec.onFrame]
 * @param {(position, direction) => void} [spec.onArrive]
 * @param {boolean} [spec.collide] stop on terrain before the end (default true)
 */
export function launchProjectile(fx, spec) {
  const { from, to } = spec;
  const distance = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
  const duration = Math.max(0.05, distance / spec.speed);
  const path = spec.path ?? 'straight';
  const position = { x: from.x, y: from.y, z: from.z };
  const previous = { x: from.x, y: from.y, z: from.z };
  const direction = { x: 0, y: 0, z: -1 };
  const control1 = {
    x: lerp(from.x, to.x, 0.33) + (spec.bend1?.x ?? 0),
    y: lerp(from.y, to.y, 0.33) + (spec.bend1?.y ?? 0),
    z: lerp(from.z, to.z, 0.33) + (spec.bend1?.z ?? 0),
  };
  const control2 = {
    x: lerp(from.x, to.x, 0.72) + (spec.bend2?.x ?? 0),
    y: lerp(from.y, to.y, 0.72) + (spec.bend2?.y ?? 0),
    z: lerp(from.z, to.z, 0.72) + (spec.bend2?.z ?? 0),
  };
  const state = { arrived: false, position, direction };

  const evaluate = (t) => {
    if (path === 'curve') return bezier(from, control1, control2, to, t, position);
    position.x = lerp(from.x, to.x, t);
    position.y = lerp(from.y, to.y, t) + (path === 'arc' ? Math.sin(Math.PI * t) * distance * (spec.arc ?? 0.1) : 0);
    position.z = lerp(from.z, to.z, t);
    return position;
  };

  const arrive = () => {
    if (state.arrived) return;
    state.arrived = true;
    spec.onArrive?.(position, direction);
  };

  const start = fx.time;
  fx.during(start, start + duration, (t, dt) => {
    if (state.arrived) return;
    previous.x = position.x; previous.y = position.y; previous.z = position.z;
    evaluate(t);
    const dx = position.x - previous.x;
    const dy = position.y - previous.y;
    const dz = position.z - previous.z;
    const step = Math.hypot(dx, dy, dz);
    if (step > 1e-5) {
      direction.x = dx / step; direction.y = dy / step; direction.z = dz / step;
    }
    if (spec.collide !== false && t > 0.05 && t < 0.999) {
      const ground = fx.groundHeight(position.x, position.z);
      if (position.y <= ground) {
        position.y = ground;
        arrive();
        return;
      }
    }
    spec.onFrame?.(position, direction, dt, t, previous);
    if (t >= 1) arrive();
  });
  return state;
}
