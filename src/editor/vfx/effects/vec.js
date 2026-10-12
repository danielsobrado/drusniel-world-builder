/** Plain-object vector helpers for recipes, where readability beats reuse. */

export function v3(x = 0, y = 0, z = 0) {
  return { x, y, z };
}

export function copy(v) {
  return { x: v.x, y: v.y, z: v.z };
}

/** a + b · s */
export function addScaled(a, b, s) {
  return { x: a.x + b.x * s, y: a.y + b.y * s, z: a.z + b.z * s };
}

export function lerpVec(a, b, t) {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
}

export function distance(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
}

export function direction(from, to) {
  const length = distance(from, to) || 1;
  return { x: (to.x - from.x) / length, y: (to.y - from.y) / length, z: (to.z - from.z) / length };
}

/** The same point, dropped onto the terrain plus `lift`. */
export function onGround(fx, point, lift = 0) {
  return { x: point.x, y: fx.groundHeight(point.x, point.z) + lift, z: point.z };
}

export const UP = Object.freeze({ x: 0, y: 1, z: 0 });
