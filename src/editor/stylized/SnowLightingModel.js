import { PhysicalLightingModel } from 'three/webgpu';
import { diffuseColor, float, max, mix, normalView, vec3 } from 'three/tsl';

/** Snowflow (MIT) deep snow scattering tint: light reaching a snow hollow loses red first. */
const CAVE_BLUE_TINT = vec3(0.48, 0.70, 1.0);
/** Snow wrap diffuse width (softer terminator than Lambert while preserving crisp drift modeling). */
const SNOW_WRAP = 0.48;
const INV_WRAP_DENOM = 1 / ((1 + SNOW_WRAP) * (1 + SNOW_WRAP));
const INV_PI = 1 / Math.PI;

/**
 * Standard PBR lighting plus Snowflow-inspired snow optics (MIT, Maksymilian Dendura):
 *
 *  1. Wrapped direct diffuse on snow (`SNOW_WRAP`), softening drift & sastrugi
 *     terminators without affecting non-snow biomes.
 *  2. Sun-shadowed glints, thickness-inverted back-scatter SSS, powder velvet
 *     rim, and glacier clearcoat specular (`sunResponse`) scaled by `lightColor`
 *     so nothing glows in cast shadow.
 *  3. Radiance-level blue-shifted cavity occlusion (`cavityOcclusion`), scaling
 *     finished radiance instead of ambient alone so snow troughs and footprints
 *     shift into glacial blue rather than warm grey/brown.
 */
export class SnowLightingModel extends PhysicalLightingModel {
  /**
   * @param {object} sunResponse vec3 per unit of incoming sun light
   * @param {object} [options]
   * @param {object|null} [options.snowWeight] 0..1 powder snow share (gates wrapped diffuse & bounce)
   * @param {object|null} [options.cavityOcclusion] 0..1 snow cavity AO (1 on open flats, <1 in hollows/crevices)
   * @param {object|null} [options.snowBounce] vec3 indirect snow-to-snow bounce radiance
   */
  constructor(sunResponse, { snowWeight = null, cavityOcclusion = null, snowBounce = null } = {}) {
    super();
    this.sunResponse = sunResponse;
    this.snowWeight = snowWeight;
    this.cavityOcclusion = cavityOcclusion;
    this.snowBounce = snowBounce;
  }

  direct(input, builder) {
    super.direct(input, builder);
    if (input.lightNode?.light?.isDirectionalLight) {
      if (this.snowWeight) {
        const dotNL = normalView.dot(input.lightDirection);
        const lambert = max(dotNL, float(0));
        const wrapped = max(dotNL.add(SNOW_WRAP).mul(INV_WRAP_DENOM), float(0));
        const wrapBoost = max(wrapped.sub(lambert), float(0)).mul(this.snowWeight);
        input.reflectedLight.directDiffuse.addAssign(
          input.lightColor.mul(diffuseColor.rgb).mul(wrapBoost.mul(INV_PI)),
        );
      }
      // 1/π keeps glints, SSS, velvet rim, and glacier glaze calibrated against lit snow.
      input.reflectedLight.directSpecular.addAssign(
        input.lightColor.mul(this.sunResponse).mul(INV_PI),
      );
    }
  }

  finish(builder) {
    super.finish(builder);
    const { outgoingLight } = builder.context;
    if (this.snowBounce) {
      outgoingLight.addAssign(this.snowBounce);
    }
    if (this.cavityOcclusion) {
      const ao = this.cavityOcclusion.clamp(0.42, 1.0);
      const caveTint = mix(vec3(1, 1, 1), CAVE_BLUE_TINT, ao.oneMinus().mul(0.88));
      outgoingLight.mulAssign(caveTint.mul(ao));
    }
  }
}

/** Gives `material` snow's wrapped diffuse, sun response, bounce, and blue-shifted cavity AO. */
export function applySnowLighting(material, sunResponse, options = {}) {
  material.setupLightingModel = () => new SnowLightingModel(sunResponse, options);
  return material;
}
