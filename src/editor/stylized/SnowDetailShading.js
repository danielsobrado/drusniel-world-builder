import {
  Fn, If, cameraViewMatrix, float, mix, normalize, texture, vec2, vec3, vec4,
} from 'three/tsl';
import { acquireSnowTextures } from '../assets/godsEnd/snowTextures.js';

/** Snow007C's centered detail response, adapted to streamed terrain normals. */
export function createSnowDetailNodes({ terrainUv, chunkWorldSize, chunkCenter, snow, material }) {
  const maps = acquireSnowTextures();
  if (!maps) return null;
  const dispose = () => {
    maps.release();
    material.removeEventListener('dispose', dispose);
  };
  material.addEventListener('dispose', dispose);
  // Power-of-two metre periods keep the origin exact and close across chunks.
  // This is detail only: terrain classification and the deformation field stay authoritative.
  const local = vec2(terrainUv.x.sub(0.5), float(0.5).sub(terrainUv.y)).mul(chunkWorldSize);
  const point = chunkCenter.mod(8).add(local).mul(0.125);
  const dx = point.dFdx().toVar('snowDetailDx');
  const dy = point.dFdy().toVar('snowDetailDy');
  const amount = snow.mul(maps.ready).clamp(0, 1);
  const detail = Fn(() => {
    const result = vec4(1, 1, 1, 0).toVar();
    If(amount.greaterThan(0.002), () => {
      const color = texture(maps.color, point).grad(dx, dy).rgb.div(vec3(0.629, 0.737, 0.849)).clamp(0.75, 1.25);
      const packed = texture(maps.packed, point).grad(dx, dy);
      const cavity = packed.r.sub(0.944).mul(0.8).add(1).clamp(0.65, 1.08);
      result.assign(vec4(color.mul(cavity), packed.g.sub(0.714).mul(0.3)));
    });
    return result;
  })();
  const slope = Fn(() => {
    const result = vec2(0).toVar();
    If(amount.greaterThan(0.002), () => {
      const sample = texture(maps.normal, point.mul(4)).grad(dx.mul(4), dy.mul(4));
      const normal = sample.xyz.mul(2).sub(1);
      result.assign(normal.xy.div(normal.z.max(0.15)).mul(2.4));
    });
    return result;
  })();
  return {
    color(base) { return base.mul(mix(vec3(1), detail.rgb, amount)); },
    roughness(base) { return base.add(detail.a.mul(amount)).clamp(0, 1); },
    normal(base) {
      const offset = cameraViewMatrix.mul(vec4(slope.x, 0, slope.y, 0)).xyz;
      return normalize(base.add(offset.mul(amount)));
    },
  };
}
