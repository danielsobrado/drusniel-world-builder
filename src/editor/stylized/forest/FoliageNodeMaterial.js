import { diffuseColor, positionViewDirection } from 'three/tsl';
import { foliageLight } from './foliageLight.js';

const classes = new WeakMap();

/** Retain each authored lighting model and survive the material clones used by LODs. */
export function foliageMaterialClass(Base) {
  if (classes.has(Base)) return classes.get(Base);
  class FoliageMaterial extends Base {
    constructor(...args) {
      super(...args);
      // A node property participates in Three's program cache key and copy().
      this.foliageTransmissionNode = null;
    }

    copy(source) {
      super.copy(source);
      // Three's copy omits this inherited accessor, including on LOD clones.
      this.alphaTest = source.alphaTest ?? 0;
      return this;
    }

    setupLightingModel(builder) {
      const model = super.setupLightingModel(builder);
      if (!model || !this.foliageTransmissionNode) return model;
      const direct = model.direct;
      const amount = this.foliageTransmissionNode;
      model.direct = function (data, nodeBuilder) {
        direct.call(this, data, nodeBuilder);
        if (!data.lightNode.light?.isDirectionalLight) return;
        const forward = positionViewDirection.negate().dot(data.lightDirection).max(0).pow(2.2);
        // lightColor already contains shadow-map and cloud attenuation. Reuse it:
        // no additional shadow lookup and no sunlight emitted from shaded leaves.
        data.reflectedLight.directDiffuse.addAssign(
          diffuseColor.rgb.mul(data.lightColor).mul(forward).mul(foliageLight.strength).mul(amount),
        );
      };
      return model;
    }
  }
  classes.set(Base, FoliageMaterial);
  classes.set(FoliageMaterial, FoliageMaterial);
  return FoliageMaterial;
}
