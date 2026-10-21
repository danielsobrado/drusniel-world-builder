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
      // Tannin water: tea-brown in a few centimetres, black-green beyond. A bog
      // (organic 1) owns its colour outright; forest streams only lean to it.
      const organicColor = mix(color('#2c3324'), color('#0b120d'), smoothstep(.08, 1.2, depth));
      const coldColor = mix(color('#638687'), color('#193f4c'), smoothstep(.3, 8, depth));
      return mix(mix(base, organicColor, organic.mul(.92)), coldColor, cold.mul(.24));
    },
    density(base) { return base.mul(organic.mul(2.5).add(1)); },
    absorption(base) { return base.mul(mix(vec3(1), vec3(1.6, 2.2, 3.4), organic)); },
    // Still bog water is a dark mirror; streams through woods stay a little rougher.
    roughness: clamp(float(.12).add(organic.mul(.12)).sub(smoothstep(.6, 1, organic).mul(.18)).add(cold.mul(.025)), 0, 1),
    clarity: oneMinus(organic.mul(.8)),
  };
}
