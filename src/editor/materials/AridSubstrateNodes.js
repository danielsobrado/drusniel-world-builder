import { Color } from 'three/webgpu';
import { Fn, If, float, mix, oneMinus, positionView, sin, smoothstep, vec3, vec4 } from 'three/tsl';
import { periodicFbm2, periodicNoise } from '../stylized/PeriodicNoiseNodes.js';

const pigment = hex => { const color = new Color(hex); return vec3(color.r, color.g, color.b); };

/** Loose sand and frost-broken mineral ground; canonical IDs remain unchanged. */
export function createAridSubstrateNodes({ tileId, bare, patterns, localXZ, cameraDistance }) {
  const hot = tileId.equal(1), cold = tileId.equal(2);
  const amount = hot.or(cold).select(bare.clamp(0, 1), float(0));
  const reach = oneMinus(smoothstep(8, 30, cameraDistance));
  const sample = Fn(() => {
    const result = vec4(0).toVar();
    If(amount.greaterThan(.001), () => {
      const p = patterns.latticePoint('fine', localXZ).toVar();
      const macro = periodicFbm2(patterns.latticePoint('broad', localXZ));
      const grain = periodicNoise(p.mul(8).add(31.7));
      const warp = periodicNoise(p.add(17.3));
      // Integer lattice frequencies close over PatternOrigins' 512-cell wrap.
      const phase = p.x.mul(4).add(p.y).mul(Math.PI * 2).add(warp.mul(2));
      const filtered = oneMinus(smoothstep(.6, 2.4, phase.fwidth())).mul(reach);
      const ripple = sin(phase).mul(filtered);
      const sandMean = mix(pigment('#b39a72'), pigment('#d6be96'), .5);
      const mineralMean = mix(pigment('#787b76'), pigment('#b6b7a5'), .5);
      const sand = mix(pigment('#b39a72'), pigment('#d6be96'), macro).div(sandMean)
        .mul(ripple.mul(.055).add(1));
      const mineral = mix(pigment('#787b76'), pigment('#b6b7a5'), macro).div(mineralMean)
        .mul(grain.sub(.5).mul(.18).mul(reach).add(1));
      const color = mix(vec3(1), hot.select(sand, mineral), oneMinus(smoothstep(80, 240, cameraDistance)));
      const height = hot.select(ripple.mul(.004), smoothstep(.58, .8, grain).mul(.006).mul(reach));
      result.assign(vec4(color, height));
    });
    return result;
  })().toVar();
  return {
    apply(color, roughness, normal) {
      // Derivatives perturb the existing terrain normal; no new texture or mesh.
      const dx = positionView.dFdx(), dy = positionView.dFdy();
      const tangentX = dy.cross(normal), tangentY = normal.cross(dx);
      const determinant = dx.dot(tangentX);
      const gradient = sample.a.dFdx().mul(tangentX).add(sample.a.dFdy().mul(tangentY)).mul(determinant.sign());
      const relief = normal.mul(determinant.abs().max(1e-8)).sub(gradient).normalize();
      // Mean-preserving gains retain the shared CPU far-color palette.
      return { color: color.mul(mix(vec3(1), sample.rgb, amount)),
        roughness: mix(roughness, hot.select(float(.93), float(.9)), amount),
        normal: mix(normal, relief, amount).normalize() };
    },
    amount,
    height: sample.a,
  };
}
