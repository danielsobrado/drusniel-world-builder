import {
  Fn, If, cameraViewMatrix, cameraWorldMatrix, float, length, max, mix, normalize, smoothstep, vec2, vec3, vec4,
} from 'three/tsl';
import { acquireSnowTextures } from '../assets/godsEnd/snowTextures.js';
import { repeatMipTextureLoad } from './RepeatMipTextureLoad.js';
import { createSnowReliefNodes } from './SnowReliefShading.js';

/** Snow007C's centered detail response, adapted to streamed terrain normals. */
export function createSnowDetailNodes({ terrainUv, chunkWorldSize, chunkCenter, snow, material, groundHeight = float(0),
  pathMask = float(0), baseNormal = null, reliefEnabled = false }) {
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
  const relief = reliefEnabled ? createSnowReliefNodes({ local, chunkCenter, snow, pathMask }) : null;
  const detail = Fn(() => {
    const result = vec4(1, 1, 1, 0).toVar();
    If(amount.greaterThan(0.002), () => {
      const color = repeatMipTextureLoad(maps.color, point, dx, dy).rgb.div(vec3(0.629, 0.737, 0.849)).clamp(0.75, 1.25);
      const packed = repeatMipTextureLoad(maps.packed, point, dx, dy);
      const cavity = packed.r.sub(0.944).mul(0.8).add(1).clamp(0.65, 1.08);
      result.assign(vec4(color.mul(cavity), packed.g.sub(0.714).mul(0.3)));
    });
    return result;
  })();
  const worldBase = baseNormal ? normalize(cameraWorldMatrix.mul(vec4(baseNormal, 0)).xyz) : vec3(0, 1, 0);
  const weights = worldBase.abs().pow(4);
  const blend = weights.div(weights.x.add(weights.y).add(weights.z).max(0.001));
  const point3 = vec3(point.x, groundHeight.mod(8).mul(0.125), point.y);
  const xyDx = point3.xy.dFdx(), xyDy = point3.xy.dFdy();
  const zyDx = point3.zy.dFdx(), zyDy = point3.zy.dFdy();
  const slope = Fn(() => {
    const result = vec3(0).toVar();
    If(amount.greaterThan(0.002), () => {
      let combined = vec2(0);
      for (const [frequency, strength] of (reliefEnabled ? [[4, 1.6], [1, 0.65], [0.25, 0.28]] : [[1, 1.6]])) {
        const sample = repeatMipTextureLoad(maps.normal, point.mul(frequency), dx.mul(frequency), dy.mul(frequency));
        const normal = sample.xyz.mul(2).sub(1);
        const fade = smoothstep(0.35, 0.9, max(length(dx), length(dy)).mul(frequency)).oneMinus();
        combined = combined.add(normal.xy.div(normal.z.max(0.15)).mul(strength).mul(fade));
      }
      let offset = vec3(combined.x, 0, combined.y);
      if (reliefEnabled && baseNormal) {
        const normalSlope = (p, ddx, ddy) => {
          const n = repeatMipTextureLoad(maps.normal, p.mul(4), ddx.mul(4), ddy.mul(4)).xyz.mul(2).sub(1);
          return n.xy.div(n.z.max(0.15)).mul(1.6);
        };
        const xy = normalSlope(point3.xy, xyDx, xyDy);
        const zy = normalSlope(point3.zy, zyDx, zyDy);
        offset = offset.mul(blend.y).add(vec3(xy.x, xy.y, 0).mul(blend.z))
          .add(vec3(0, zy.y, zy.x).mul(blend.x));
      }
      result.assign(offset.mul(float(1).sub(pathMask.mul(0.65))));
    });
    return result;
  })();
  return {
    color(base) { const value = base.mul(mix(vec3(1), detail.rgb, amount)); return relief ? relief.color(value) : value; },
    roughness(base) { const value = base.add(detail.a.mul(amount)).clamp(0, 1); return relief ? relief.roughness(value) : value; },
    normal(base) {
      const offset = cameraViewMatrix.mul(vec4(slope, 0)).xyz;
      const value = normalize(base.add(offset.mul(amount)));
      return relief ? relief.normal(value) : value;
    },
  };
}
