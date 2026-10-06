import { cameraViewMatrix, clamp, float, max, mix, oneMinus, vec2, vec4 } from 'three/tsl';

/** Ripple refraction follows the same normal as the reflection, in screen axes. */
export function waterRippleRefraction(normal, baseNormal) {
  const perturbation = cameraViewMatrix.mul(vec4(normal.sub(baseNormal), 0));
  // Texture v points down the screen, camera y points up.
  return perturbation.xy.mul(vec2(1, -1));
}

/** Composite opaque foam over translucent water, returning straight RGB + alpha. */
export function compositeWaterFoam(color, opacity, foamColor, foamCoverage) {
  const coverage = clamp(foamCoverage, 0, 1);
  const alpha = coverage.add(opacity.mul(oneMinus(coverage))).toVar('foamedWaterOpacity');
  const premultiplied = mix(color.mul(opacity), foamColor, coverage);
  return { color: premultiplied.div(max(alpha, float(1e-4))), opacity: alpha };
}
