import { cos, float, mod, sin, smoothstep, time, vec2 } from 'three/tsl';

/** Five-iteration tileable caustic lattice from Gods' End CinematicPipeline. */
export function godsEndCausticLattice(xz, tileMeters = 5.5) {
  const tau = Math.PI * 2;
  const p = mod(xz.mul(tau / tileMeters), tau).sub(250).toVar();
  const clock = time.mul(0.5).add(23).toVar();
  let i = p;
  let sum = float(1);
  for (let n = 0; n < 5; n++) {
    const t = clock.mul(1 - 3.5 / (n + 1));
    i = p.add(vec2(cos(t.sub(i.x)).add(sin(t.add(i.y))), sin(t.sub(i.y)).add(cos(t.add(i.x))))).toVar();
    const ray = vec2(p.x.div(sin(i.x.add(t)).div(0.005)), p.y.div(cos(i.y.add(t)).div(0.005)));
    sum = sum.add(float(1).div(ray.length().max(1e-6)));
  }
  return float(1.17).sub(sum.div(5).pow(1.4)).abs().pow(8);
}

/** Distance-filtered crossed surface ripples from the donor's Snell window. */
export function godsEndSurfaceRipple(point, distance, phases) {
  const near = smoothstep(8, 70, distance).oneMinus();
  const fine = smoothstep(4, 26, distance).oneMinus();
  const phase = (index, x, z) => point.x.mul(x).add(point.y.mul(z)).add(phases[index]);
  return vec2(
    cos(phase(0, 0.9, 0.35).add(time.mul(1.1))),
    cos(phase(1, -0.3, 0.8).add(time.mul(0.9))),
  ).mul(0.085).add(vec2(
    cos(phase(2, 2.3, -1.1).sub(time.mul(1.7))),
    cos(phase(3, 0.9, 2.1).add(time.mul(1.5))),
  ).mul(0.05).mul(near)).add(vec2(
    cos(phase(4, 5.1, 3.7).add(time.mul(2.6))),
    cos(phase(5, -3.1, 4.8).sub(time.mul(2.3))),
  ).mul(0.028).mul(fine));
}

export const UNDERWATER_RIPPLE_WAVES = Object.freeze([
  [0.9, 0.35], [-0.3, 0.8], [2.3, -1.1], [0.9, 2.1], [5.1, 3.7], [-3.1, 4.8],
]);
