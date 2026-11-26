import { Fn, If, abs, float, mix, normalView, select, vec3, vec4 } from 'three/tsl';
import { acquireSnowTextures } from '../../assets/godsEnd/snowTextures.js';
import { repeatMipTextureLoad } from '../RepeatMipTextureLoad.js';
import { coatDetailFade, perturbByMap } from '../../../render/materials/surfaceLayers/PbrCoatBlend.js';
import { surfaceCoatings } from './SurfaceCoatingConfig.js';

/** Snow007C's period, as the terrain draws it (SnowDetailShading): 8 m. */
const SNOW_PER_METRE = 0.125;
/** Snow007C's mean albedo and roughness, divided out so the grain only varies the coat's own. */
const SNOW_MEAN = vec3(0.629, 0.737, 0.849);
const SNOW_MEAN_ROUGHNESS = 0.714;
/** Below this coverage a fragment loads no snow texels at all. */
const VISIBLE = 0.002;

/**
 * The snow coat's appearance: the terrain's Snow007C grain, cavities and normals
 * at point `p` (metres) on a face with normal `n` in the same frame, projected
 * along the face's dominant axis. Where it lies is the caller's `cover`, which
 * also gates every texture load, so snowless surfaces pay only a branch.
 * Sampler-free, like the terrain's (RepeatMipTextureLoad). Null without an image decoder.
 *
 * @returns {{ tint, roughness, normal: () => import('three/tsl').Node|null }}
 *   tint multiplies the snow colour (about 1), roughness is an offset on the
 *   configured snow roughness, and normal() is the coat's view normal, built in
 *   the material's normal stage, or null when the snow coat is disabled.
 */
export function snowCoat(p, n, cover, settings = surfaceCoatings()) {
  const maps = acquireSnowTextures();
  if (!maps) return null;
  const q = p.mul(SNOW_PER_METRE);
  const top = abs(n.y).greaterThan(0.55);
  const xSide = abs(n.x).greaterThan(abs(n.z));
  const point = select(top, q.xz, select(xSide, q.zy, q.xy)).toVar();
  // Derivatives of the continuous projections, so the face-axis switch does not
  // read as a huge footprint and drop a seam to the coarsest mip.
  const dx = select(top, q.xz.dFdx(), select(xSide, q.zy.dFdx(), q.xy.dFdx())).toVar();
  const dy = select(top, q.xz.dFdy(), select(xSide, q.zy.dFdy(), q.xy.dFdy())).toVar();
  const visible = float(cover).greaterThan(VISIBLE);
  const grain = Fn(() => {
    const result = vec4(1, 1, 1, 0).toVar();
    If(visible, () => {
      const pigment = repeatMipTextureLoad(maps.color, point, dx, dy).rgb.div(SNOW_MEAN).clamp(0.8, 1.2);
      const packed = repeatMipTextureLoad(maps.packed, point, dx, dy);
      // AO darkens the hollows and blues them, as skylight fills a snow pit.
      const cavity = mix(float(1), packed.r.div(0.944), 0.7).clamp(0.55, 1);
      const tint = pigment.mul(cavity).mul(mix(vec3(1), vec3(0.62, 0.76, 1), cavity.oneMinus().mul(1.4)));
      result.assign(vec4(tint, packed.g.sub(SNOW_MEAN_ROUGHNESS).mul(0.3)));
    });
    return result;
  })();
  const ready = maps.ready;
  return {
    tint: mix(vec3(1), grain.rgb, ready),
    roughness: grain.a.mul(ready),
    normal(baseNormal = normalView) {
      if (!settings.snow.enabled) return null;
      const sample = Fn(() => {
        const result = vec3(0, 0, 1).toVar();
        If(visible, () => {
          result.assign(repeatMipTextureLoad(maps.normal, point, dx, dy).xyz.mul(2).sub(1));
        });
        return result;
      })();
      const strength = coatDetailFade(settings.detail).mul(settings.snow.normalStrength).mul(ready);
      // Built on the caller's snow normal (defaulting to geometric `normalView`): snow buries rock relief.
      return perturbByMap(baseNormal, sample, dx, dy, strength);
    },
  };
}
