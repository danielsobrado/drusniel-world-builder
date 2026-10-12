import * as THREE from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import { attribute, clamp, positionWorld, texture, varying, vec2, vec3 } from 'three/tsl';
import { atlasTileUv, sampleRamp } from './atlasNodes.js';
import { shadeVfx } from './VfxLightingUniforms.js';

/**
 * Ground decal material. Each vertex names its slot; the slot's tile, ramp,
 * fade, heat, tint and emission come from two uniform arrays, so fading or
 * cooling a decal never touches a vertex buffer.
 */
export function createDecalMaterial({ atlas, lighting, slotLook, slotTint }) {
  const decalUv = attribute('decalUv', 'vec4');
  const slot = decalUv.z;
  const look = slotLook.element(slot);
  const tint = slotTint.element(slot);
  const vUv = varying(atlasTileUv(look.x, vec2(decalUv.x, decalUv.y)));
  const vRamp = varying(look.y);
  const vAlpha = varying(look.z);
  const vHeat = varying(look.w);
  const vTint = varying(tint.xyz);
  const vEmissive = varying(tint.w);

  const texel = texture(atlas, vUv);
  const coverage = texel.a;
  const detail = texel.b;
  const light = shadeVfx(lighting, positionWorld, vec3(0, 1, 0), 0.25);
  const ramp = sampleRamp(atlas, vRamp, clamp(vHeat.mul(detail), 0, 1));
  const emission = ramp.rgb.mul(ramp.a).mul(vEmissive).mul(detail).mul(vAlpha).mul(lighting.emissionScale);
  const alpha = clamp(coverage.mul(vAlpha), 0, 1);

  const material = new MeshBasicNodeMaterial();
  material.name = 'vfx-decals';
  material.colorNode = vTint.mul(light).mul(alpha).add(emission);
  material.opacityNode = alpha;
  material.transparent = true;
  material.depthWrite = false;
  material.depthTest = true;
  material.polygonOffset = true;
  material.polygonOffsetFactor = -2;
  material.polygonOffsetUnits = -4;
  material.fog = false;
  material.toneMapped = false;
  material.blending = THREE.CustomBlending;
  material.blendEquation = THREE.AddEquation;
  material.blendSrc = THREE.OneFactor;
  material.blendDst = THREE.OneMinusSrcAlphaFactor;
  material.blendEquationAlpha = THREE.AddEquation;
  material.blendSrcAlpha = THREE.ZeroFactor;
  material.blendDstAlpha = THREE.OneFactor;
  return material;
}
