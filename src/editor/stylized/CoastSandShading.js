import { Color } from 'three/webgpu';
import { Fn, If, cameraPosition, float, mix, oneMinus, positionWorld, sin, smoothstep, vec2, vec3, vec4 } from 'three/tsl';
import { periodicFbm2 } from './PeriodicNoiseNodes.js';
import { seaStateUniforms } from '../water/seaState.js';
import { godsEndCausticLattice } from '../water/GodsEndWaterPatterns.js';

export const DEFAULT_COAST_SAND = Object.freeze({
  enabled: true, dryDark: '#b39a72', dryLight: '#d6be96',
  seabedColor: '#efe6cf', seabedColorWeight: 0.55,
  reefColor: '#426356', reefRockColor: '#6d7b68', reefStrength: 0.55,
  causticStrength: 0.65,
});

function colorNode(value) {
  const c = new Color(value); return vec3(c.r, c.g, c.b);
}

/** grass-test's warm beach, pale submerged sand and mottled reef shelf. */
export function createCoastSandNodes({ localXZ, patterns, groundHeight, sandMask, waterCoverage, config = {} }) {
  const settings = { ...DEFAULT_COAST_SAND, ...config };
  if (!settings.enabled) return null;
  const height = groundHeight.sub(seaStateUniforms.seaLevel);
  const bedDepth = height.negate();
  const beach = oneMinus(smoothstep(1.8, 2.8, height)).mul(smoothstep(-0.6, 0, height)).mul(sandMask);
  const bed = smoothstep(0.1, 0.7, bedDepth).mul(oneMinus(smoothstep(10, 16, bedDepth))).mul(waterCoverage);
  const amount = beach.max(bed);
  // Noise, shelf mottling and caustics execute only in the coastal band.
  return {
    apply(color, roughness) {
      const result = Fn(() => {
        const response = vec4(color, roughness).toVar();
        If(amount.greaterThan(0.001), () => {
          const point = patterns.latticePoint('sand', localXZ);
          const macro = periodicFbm2(point.mul(0.125));
          const meso = sin(point.x.mul(3.1).add(sin(point.y.mul(3.8))))
            .mul(sin(point.y.mul(4.7))).mul(0.5).add(0.5);
          const ripples = sin(point.x.mul(19).add(sin(point.y.mul(7)).mul(0.8))).mul(0.025).add(1);
          const dry = mix(colorNode(settings.dryDark), colorNode(settings.dryLight), macro)
            .mul(ripples).mul(mix(float(0.93), float(1.06), meso));
          const bedSand = mix(dry, colorNode(settings.seabedColor).mul(ripples), settings.seabedColorWeight);
          const reefBand = smoothstep(0.6, 1.6, bedDepth).mul(oneMinus(smoothstep(4.5, 6.5, bedDepth)));
          const reef = smoothstep(0.52, 0.68, periodicFbm2(point.mul(0.5).add(vec2(7.1, 2.3))))
            .mul(reefBand).mul(settings.reefStrength);
          const reefColor = mix(colorNode(settings.reefColor), colorNode(settings.reefRockColor), meso);
          const bedColor = mix(bedSand, reefColor, reef);
          const causticFade = smoothstep(0.25, 0.65, bedDepth)
            .mul(oneMinus(smoothstep(2, 5.7, bedDepth)))
            .mul(oneMinus(smoothstep(26, 54, cameraPosition.distance(positionWorld))));
          const caustic = godsEndCausticLattice(patterns.latticePoint('sandCaustics', localXZ), 5.5)
            .mul(causticFade).mul(settings.causticStrength);
          const sand = mix(dry, bedColor.mul(caustic.add(1)), bed);
          response.assign(vec4(mix(color, sand, amount), mix(roughness, float(0.95), amount)));
        });
        return response;
      })().toVar();
      return { color: result.rgb, roughness: result.a };
    },
  };
}
