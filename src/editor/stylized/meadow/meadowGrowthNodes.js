import { mix,smoothstep } from 'three/tsl';
import { meadowNoise } from './meadowNoise.js';
export function meadowGrowthNodes(uniforms,instance,cards=false) {
  const dimensions=uniforms.growth.dimensions.element(instance.growth.toInt());
  const noise=meadowNoise(instance.canonical.div(dimensions.w)).clamp(0,1);
  return {height:mix(dimensions.x,dimensions.y,smoothstep(.55,.75,noise)).mul(cards?1.125:1),
    width:dimensions.z,density:uniforms.growth.density.element(instance.growth.toInt()).x};
}
