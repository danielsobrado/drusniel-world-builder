import {
  attribute, cameraPosition, cos, float, modelWorldMatrix, positionGeometry,
  positionLocal, sin, smoothstep, uniform, vec2, vec3, vec4,
} from 'three/tsl';
import { canonicalFromRender, sampleWorldWind, windWaveCoordinates } from '../../weather/wind/worldWindState.js';

/**
 * Rooted canopy bend driven by the meadow's travelling wind. Bounds are uniforms
 * so prototypes share shader programs. Phase uses canonical world coordinates;
 * changing the instance anchor or render origin cannot reset a crown's motion.
 */
export function foliageWindPosition({ config, time, minimumY = 0, maximumY = 1, flutter = true, stiffness = true }) {
  const minimum = uniform(minimumY);
  const height = uniform(Math.max(0.001, maximumY - minimumY));
  const r = positionGeometry.y.sub(minimum).div(height).clamp(0, 1);
  const world = modelWorldMatrix.mul(vec4(positionLocal, 1));
  const field = sampleWorldWind(world.xz);
  const wave = windWaveCoordinates(canonicalFromRender(world.xz));
  const phase = attribute('instanceDither', 'vec3').y.mul(0.9);
  const wind = config.wind;
  const frequency = wind.frequency ?? 0.47;
  const speed = wind.speed ?? 1.3;
  const primary = sin(wave.along.mul(frequency).add(time.mul(speed)).add(phase));
  const turbulence = sin(wave.across.mul(frequency * 1.9)
    .add(time.mul(speed * 0.7)).add(phase.mul(0.6)).add(2.6)).mul((wind.turbulence ?? 0.04) * 0.25);
  const compliance = stiffness ? float(1).div(attribute('instanceMorphology', 'vec3').z.clamp(0.65, 1.35)) : float(1);
  const gust = field.envelope.clamp(0.35, 3.5);
  // Trees are stiffer than grass. A bounded angle makes the upper crown arc
  // gently instead of sliding the cards and pumping them vertically with abs(sin).
  const angle = primary.add(turbulence).mul(config.trees.windStrength * 0.45)
    .add((wind.lean ?? 0) * config.trees.windStrength * 0.65)
    .mul(compliance).mul(gust).clamp(-0.22, 0.22).mul(r.mul(r));
  const reach = sin(angle).mul(height).mul(r);
  const direction = field.direction;
  let lateral = vec2(0);
  if (flutter) {
    const across = vec2(direction.y.negate(), direction.x);
    const distanceFade = smoothstep(wind.flutter?.fadeStart ?? 22, wind.flutter?.fadeEnd ?? 38,
      world.xyz.sub(cameraPosition).length()).oneMinus();
    const flutterWave = sin(wave.across.mul(wind.flutter?.frequency ?? 1.9)
      .add(time.mul(wind.flutter?.speed ?? 3.4)).add(phase.mul(3.1))
      .add(positionGeometry.y.mul(2.3)).add(positionGeometry.x));
    lateral = across.mul(flutterWave.mul(config.trees.windStrength * config.trees.flutterAmplitude * 0.18)
      .mul(r.pow(3)).mul(distanceFade).mul(gust.sqrt()));
  }
  return positionLocal.add(vec3(
    direction.x.mul(reach).add(lateral.x),
    cos(angle).sub(1).mul(height).mul(r),
    direction.y.mul(reach).add(lateral.y),
  ));
}
