import { attribute, cos, positionLocal, sin, vec3 } from 'three/tsl';
import { plantSwayTime } from './plantSway.js';

/** Original donor phase and tip response, with roots fixed before instancing. */
export function applyAquaticSway(material, { amount, height = 1 }) {
  const phase = attribute('instanceDither', 'vec3').y.mul(Math.PI * 2);
  // positionLocal is already instanced in a positionNode. The raw position
  // attribute supplies the rooted prototype height at every world location.
  const tip = attribute('position', 'vec3').y.div(height).clamp(0, 1);
  const wave = plantSwayTime.mul(0.9).add(phase).add(tip.mul(1.4));
  const reach = tip.mul(tip).mul(amount);
  material.positionNode = positionLocal.add(vec3(sin(wave).mul(reach), 0, cos(wave.mul(0.8)).mul(reach.mul(0.7))));
  return material;
}
