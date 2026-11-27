import { diffuseColor, float, mix, normalGeometry, normalLocal, normalView, positionLocal, positionViewDirection, smoothstep, vec3 } from 'three/tsl';
import { foliageLight } from './foliageLight.js';

const classes = new WeakMap();

/** Thin-sheet gouache scattering: view-to-sun backlighting gated by thin outer canopy edges. */
export function leafTransmissionResponse(normal, light, view, thickness, visibility = float(1), absorption = float(1.8)) {
  const cosine = normal.dot(light);
  const opticalDepth = thickness.mul(absorption).div(cosine.abs().mul(0.35).add(0.65));
  const path = opticalDepth.negate().exp();
  const back = cosine.negate().max(0);
  const sunBacklight = view.negate().dot(light).max(0);
  const outerShell = smoothstep(0.35, 0.95, visibility);
  const gouacheEdge = sunBacklight.pow(1.5).mul(outerShell);
  const active = back.mul(0.55).add(gouacheEdge.mul(0.65));
  return path.mul(active).mul(visibility);
}

/** Bounded dielectric film: already-shadowed direct light, no scene copies. */
export function foliageSurfaceHighlight(normal, light, view, wetness, needles = float(0), roughness = float(0.28), needleDirection = null) {
  const half = light.add(view).add(vec3(0, 0, 0.00001)).normalize();
  const facing = normal.dot(light).max(0);
  const fresnel = view.dot(half).clamp(0, 1).oneMinus().pow(5).mul(0.98).add(0.02);
  const exponent = roughness.mul(roughness).max(0.02).reciprocal().mul(2).clamp(8, 96);
  const wet = normal.dot(half).max(0).pow(exponent).mul(wetness).mul(exponent.add(2).div(8));
  // Elongate the lobe along the card's needle direction, when one is available.
  const needle = (needleDirection
    ? half.dot(needleDirection).pow(2).oneMinus().max(0).pow(16).mul(normal.dot(half).max(0).pow(4))
    : normal.dot(half).max(0).pow(16)).mul(needles);
  return wet.add(needle).mul(fresnel).mul(facing);
}

/** Custom Half-Lambert (N·L * 0.5 + 0.5)^1.4 wrapped-diffuse delta, keeping shadow attenuation intact. */
export function foliageWrapDiffuseResponse(normal, light, wrap, visibility = float(1)) {
  const ndl = normal.dot(light);
  const halfLambert = ndl.mul(0.5).add(0.5).clamp(0, 1).pow(1.4);
  const strength = wrap.mul(1.65).clamp(0, 1);
  return halfLambert.sub(ndl.max(0)).max(0).mul(strength).mul(visibility);
}

/** Directional gouache backlighting along thin outer crown edges (zero halo looking away from sun). */
export function foliageRimGlowResponse(normal, light, view, rimGlow, visibility = float(1)) {
  const grazing = normal.dot(view).abs().clamp(0, 1).oneMinus().pow(1.8);
  const viewBacklight = view.negate().dot(light).mul(0.5).add(0.5).clamp(0, 1).pow(1.5);
  const sunWrap = normal.dot(light).mul(0.35).add(0.65).clamp(0, 1);
  const outerThinness = smoothstep(0.25, 0.92, visibility).mul(visibility);
  return grazing.mul(viewBacklight).mul(sunWrap).mul(2.1).mul(rimGlow).mul(outerThinness);
}

/** Retain each authored lighting model and survive the material clones used by LODs. */
export function foliageMaterialClass(Base) {
  if (classes.has(Base)) return classes.get(Base);
  class FoliageMaterial extends Base {
    constructor(...args) {
      super(...args);
      // A node property participates in Three's program cache key and copy().
      this.foliageTransmissionNode = null;
      this.foliageThicknessNode = null;
      this.foliageTransmissionColorNode = null;
      this.foliageVisibilityNode = null;
      this.foliageWrapDiffuseNode = null;
      this.foliageRimGlowNode = null;
      this.foliageWetnessNode = null;
      this.foliageNeedleSpecularNode = null;
      this.foliageNeedleDirectionNode = null;
      this.foliageShapeNormalNode = null;
      this.foliageNormalBlendNode = null;
      this.foliageRimRuffleNode = null;
      /** World-space ground normal and the share of it a plant's foot takes (applySkywardNormal). */
      this.foliageGroundNormalNode = null;
      this.foliageGroundNormalWeightNode = null;
      this.foliageAbsorptionNode = null;
      this.foliageWetRoughnessNode = null;
      this.foliageDryRoughnessNode = null;
      this.treeSurfaceShadowNode = null;
      this.treeWetnessNode = null;
      this.treeBarkHeightNode = null;
      this.foliageSnowNode = null;
      this.foliageAtmosphereNode = null;
    }

    copy(source) {
      super.copy(source);
      // Three's copy omits this inherited accessor, including on LOD clones.
      this.alphaTest = source.alphaTest ?? 0;
      return this;
    }

    setupPosition(builder) {
      if (this.foliageRimRuffleNode) {
        positionLocal.addAssign(this.foliageRimRuffleNode);
      }
      if (this.foliageShapeNormalNode) {
        normalLocal.assign(mix(normalGeometry, this.foliageShapeNormalNode, this.foliageNormalBlendNode)
          .add(normalGeometry.mul(0.00001)).normalize());
      }
      return super.setupPosition(builder);
    }

    setupLightingModel(builder) {
      const model = super.setupLightingModel(builder);
      if (!model || (!this.foliageTransmissionNode && !this.treeSurfaceShadowNode)) return model;
      const direct = model.direct;
      const amount = this.foliageTransmissionNode ?? float(0);
      const thickness = this.foliageThicknessNode;
      const tint = this.foliageTransmissionColorNode;
      const visibility = this.foliageVisibilityNode ?? float(1);
      const wrapDiffuse = this.foliageWrapDiffuseNode;
      const rimGlow = this.foliageRimGlowNode;
      const wetness = this.foliageWetnessNode;
      const needles = this.foliageNeedleSpecularNode;
      const absorption = this.foliageAbsorptionNode;
      const roughness = this.foliageWetRoughnessNode;
      const reliefShadow = this.treeSurfaceShadowNode;
      const snow = this.foliageSnowNode ?? float(0);
      const needleDirection = this.foliageNeedleDirectionNode;
      model.direct = function (data, nodeBuilder) {
        const directional = data.lightNode.light?.isDirectionalLight;
        if (directional && reliefShadow) data = { ...data, lightColor: data.lightColor.mul(reliefShadow) };
        const fraction = amount.mul(foliageLight.strength).clamp(0, 1);
        // Reserve a share of reflected energy for transmission and let baked canopy
        // occlusion softly shade sheltered interior leaves from direct sun.
        const coreSun = mix(float(0.56), float(1), visibility);
        const directScale = fraction.mul(snow.oneMinus()).oneMinus().mul(mix(coreSun, float(1), snow));
        direct.call(this, thickness && directional
          ? { ...data, lightColor: data.lightColor.mul(directScale) } : data, nodeBuilder);
        if (wetness) data.reflectedLight.directSpecular.addAssign(data.lightColor.mul(
          foliageSurfaceHighlight(normalView, data.lightDirection, positionViewDirection, wetness, needles ?? float(0), roughness ?? float(0.28), needleDirection),
        ));
        if (!directional) return;
        if (thickness) {
          const leaf = leafTransmissionResponse(normalView, data.lightDirection, positionViewDirection, thickness, visibility, absorption ?? float(1.8));
          const response = mix(leaf, positionViewDirection.negate().dot(data.lightDirection).max(0).pow(2.2), snow);
          const warmTint = mix(tint, vec3(1), snow);
          let extra = response.mul(fraction).mul(warmTint);
          if (wrapDiffuse) {
            const wrap = foliageWrapDiffuseResponse(normalView, data.lightDirection, wrapDiffuse, visibility).mul(snow.oneMinus());
            extra = extra.add(mix(vec3(1), tint, 0.42).mul(wrap.mul(0.68)));
          }
          if (rimGlow) {
            const rim = foliageRimGlowResponse(normalView, data.lightDirection, positionViewDirection, rimGlow, visibility).mul(snow.oneMinus());
            extra = extra.add(tint.mul(rim.mul(0.58)));
          }
          data.reflectedLight.directDiffuse.addAssign(
            diffuseColor.rgb.mul(data.lightColor).mul(extra),
          );
          return;
        }
        const forward = positionViewDirection.negate().dot(data.lightDirection).max(0).pow(2.2);
        // lightColor already contains shadow-map and cloud attenuation. Reuse it:
        // no additional shadow lookup and no sunlight emitted from shaded leaves.
        const warmGlow = vec3(1.06, 1.04, 0.88);
        let extra = vec3(forward.mul(foliageLight.strength).mul(amount));
        if (wrapDiffuse) extra = extra.add(warmGlow.mul(foliageWrapDiffuseResponse(normalView, data.lightDirection, wrapDiffuse, visibility).mul(0.62)));
        if (rimGlow) extra = extra.add(warmGlow.mul(foliageRimGlowResponse(normalView, data.lightDirection, positionViewDirection, rimGlow, visibility).mul(0.52)));
        data.reflectedLight.directDiffuse.addAssign(
          diffuseColor.rgb.mul(data.lightColor).mul(extra),
        );
      };
      return model;
    }
  }
  classes.set(Base, FoliageMaterial);
  classes.set(FoliageMaterial, FoliageMaterial);
  return FoliageMaterial;
}
