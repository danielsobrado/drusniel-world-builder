// Adapted from Gods’ End’s metre-based house kit.
export const UP = [0, 1, 0];
// How far foundations reach below a house's ground line: more than the 4-5 m
// the village terrain falls across a footprint.
export const FOUNDATION_DEPTH = 6;
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const length = (a) => Math.hypot(a[0], a[1], a[2]);
export const normalize = (a) => { const l = length(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

// The in-plane axes a face's texture follows: u horizontal, v up the face
// (up the slope on a roof). Horizontal faces use world x and z.
export function faceAxes(normal, uHint) {
  let u = uHint ? normalize(sub(uHint, scale(normal, dot(uHint, normal)))) : cross(UP, normal);
  if (length(u) < 1e-4) u = [1, 0, 0];
  u = normalize(u);
  return { u, v: normalize(cross(normal, u)) };
}

