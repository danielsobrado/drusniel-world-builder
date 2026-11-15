import * as THREE from 'three/webgpu';
import { rod } from './propKit.js';

/** Height a drum is quarried to, metres; the shaft divides into whole drums near this. */
const DRUM_HEIGHT = 1.2;
/** Share of the radius each drum's arrises are cut back at a joint, and how far up they run. */
const CHAMFER_INSET = 0.035, CHAMFER_HEIGHT = 0.05;
/** How much the shaft swells at mid-height over its straight taper. */
const ENTASIS = 0.022;

const hash = (n) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/**
 * A column shaft from `a` up to `c` laid as stacked drums rather than one
 * prism: each drum is chamfered top and bottom so the joints read as a shadow
 * line, the shaft swells slightly (entasis) over its straight taper, and every
 * drum is a slightly different stone.
 */
export function columnDrums(b, material, a, c, r0, r1, sides, tint = 0xffffff) {
  const length = c.y - a.y;
  const count = Math.max(1, Math.round(length / DRUM_HEIGHT));
  const radiusAt = (t) => (r0 + (r1 - r0) * t) * (1 + ENTASIS * Math.sin(Math.PI * t));
  const at = (t) => ({ x: a.x + (c.x - a.x) * t, y: a.y + length * t, z: a.z + (c.z - a.z) * t });
  const base = new THREE.Color(tint);
  const chamfer = Math.min(CHAMFER_HEIGHT, length / count / 4);
  for (let index = 0; index < count; index += 1) {
    const t0 = index / count, t1 = (index + 1) / count;
    const lift = chamfer / length;
    const rLow = radiusAt(t0), rHigh = radiusAt(t1);
    const tone = base.clone().multiplyScalar(0.93 + hash(index + a.x * 3.1 + a.z * 7.7) * 0.13).getHex();
    b.prop(material, [
      rod(at(t0), at(t0 + lift), rLow * (1 - CHAMFER_INSET), radiusAt(t0 + lift), sides),
      rod(at(t0 + lift), at(t1 - lift), radiusAt(t0 + lift), radiusAt(t1 - lift), sides),
      rod(at(t1 - lift), at(t1), radiusAt(t1 - lift), rHigh * (1 - CHAMFER_INSET), sides),
    ], tone);
  }
}
