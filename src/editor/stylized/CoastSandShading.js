import { Color } from 'three/webgpu';
import { Fn, If, cameraPosition, float, mix, oneMinus, positionWorld, sin, smoothstep, time, vec3, vec4 } from 'three/tsl';
import { periodicFbm2 } from './PeriodicNoiseNodes.js';
import { seaStateUniforms } from '../water/seaState.js';
import { godsEndCausticLattice } from '../water/GodsEndWaterPatterns.js';
import { resolveCoastSand } from '../water/CoastSandConfig.js';

function colorNode(value) {
  const c = new Color(value); return vec3(c.r, c.g, c.b);
}

/** grass-test's warm beach, pale submerged sand and mottled reef shelf. */
export function createCoastSandNodes({ localXZ, patterns, groundHeight, sandMask, waterCoverage, oceanMask = float(1), config = {}, clock = time }) {
  const settings = resolveCoastSand(config);
  if (!settings.enabled) return null;
  const height = groundHeight.sub(seaStateUniforms.seaLevel);
  const bedDepth = height.negate();
  const beach = oneMinus(smoothstep(1.8, 2.8, height)).mul(smoothstep(-0.6, 0, height)).mul(sandMask);
  const bed = smoothstep(0.1, 0.7, bedDepth).mul(oneMinus(smoothstep(10, 16, bedDepth))).mul(waterCoverage);
  const amount = beach.max(bed).mul(oceanMask);
  // Noise, shelf mottling and caustics execute only in the coastal band.
  return {
    apply(color, roughness) {
      const result = Fn(() => {
        const response = vec4(color, roughness).toVar();
        If(amount.greaterThan(0.001), () => {
          const macro = periodicFbm2(patterns.latticePoint('sandMacro', localXZ));
          const phase = name => patterns.wavePhase(name, localXZ);
          const meso = sin(phase('sandMesoX').add(sin(phase('sandMesoWarp'))))
            .mul(sin(phase('sandMesoZ'))).mul(0.5).add(0.5);
          const ripples = sin(phase('sandRippleX').add(sin(phase('sandRippleWarp')).mul(0.8))).mul(0.025).add(1);
          const dry = mix(colorNode(settings.dryDark), colorNode(settings.dryLight), macro)
            .mul(ripples).mul(mix(float(0.93), float(1.06), meso));
          const bedSand = mix(dry, colorNode(settings.seabedColor).mul(ripples), settings.seabedColorWeight);
          const reefBand = smoothstep(0.6, 1.6, bedDepth).mul(oneMinus(smoothstep(4.5, 6.5, bedDepth)));
          const reef = smoothstep(0.52, 0.68, periodicFbm2(patterns.latticePoint('sandReef', localXZ)))
            .mul(reefBand).mul(settings.reefStrength);
          const reefColor = mix(colorNode(settings.reefColor), colorNode(settings.reefRockColor), meso);
          const bedColor = mix(bedSand, reefColor, reef);
          const causticFade = smoothstep(0.25, 0.65, bedDepth)
            .mul(oneMinus(smoothstep(2, 5.7, bedDepth)))
            .mul(oneMinus(smoothstep(26, 54, cameraPosition.distance(positionWorld))));
          const caustic = godsEndCausticLattice(patterns.latticePoint('sandCaustics', localXZ), 5.5, clock)
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
