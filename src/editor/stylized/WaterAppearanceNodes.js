import { Color } from 'three/webgpu';
import { clamp, float, mix, oneMinus, round, smoothstep, vec3 } from 'three/tsl';

const color = hex => { const c = new Color(hex); return vec3(c.r, c.g, c.b); };

/** Discrete identity is nearest sampled; only continuous appearance is filtered. */
export function createWaterAppearanceNodes(nearest, filtered) {
  const kind = round(nearest.r.mul(255));
  const organic = filtered.g.clamp(0, 1), cold = filtered.b.clamp(0, 1);
  return {
    kind, organic, cold,
    ocean: float(kind.equal(1)), lake: float(kind.equal(2)), river: float(kind.equal(3)),
    exposure: filtered.a.clamp(.3, 1),
    color(base, depth) {
      const organicColor = mix(color('#45594b'), color('#172f29'), smoothstep(.3, 5, depth));
      const coldColor = mix(color('#638687'), color('#193f4c'), smoothstep(.3, 8, depth));
      return mix(mix(base, organicColor, organic.mul(.72)), coldColor, cold.mul(.24));
    },
    density(base) { return base.mul(organic.mul(.7).add(1)); },
    absorption(base) { return base.mul(mix(vec3(1), vec3(1.1, 1.5, 2.3), organic)); },
    roughness: clamp(float(.12).add(organic.mul(.12)).add(cold.mul(.025)), 0, 1),
    clarity: oneMinus(organic.mul(.5)),
  };
}
