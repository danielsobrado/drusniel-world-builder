import * as THREE from 'three/webgpu';
import { float, oneMinus, positionWorld, smoothstep, texture } from 'three/tsl';
import { frameUniform } from '../../render/FrameUniforms.js';

export const IMPACT_FIELD_RESOLUTION = 256;
const pixels = new Uint8Array(IMPACT_FIELD_RESOLUTION * IMPACT_FIELD_RESOLUTION * 4);
export const coastalImpactTexture = new THREE.DataTexture(
  pixels, IMPACT_FIELD_RESOLUTION, IMPACT_FIELD_RESOLUTION, THREE.RGBAFormat, THREE.UnsignedByteType,
);
coastalImpactTexture.name = 'coastal-rock-impact';
coastalImpactTexture.colorSpace = THREE.NoColorSpace;
coastalImpactTexture.minFilter = THREE.LinearFilter;
coastalImpactTexture.magFilter = THREE.LinearFilter;
coastalImpactTexture.wrapS = THREE.ClampToEdgeWrapping;
coastalImpactTexture.wrapT = THREE.ClampToEdgeWrapping;
coastalImpactTexture.generateMipmaps = false;
coastalImpactTexture.needsUpdate = true;

export const coastalImpactUniforms = Object.freeze({
  renderOrigin: frameUniform(new THREE.Vector2()),
  inverseSpan: frameUniform(1 / 64),
  fadeFraction: frameUniform(4 / 64),
  active: frameUniform(0),
});

export function clearCoastalImpactTexture() {
  coastalImpactTexture.image.data.fill(0);
  coastalImpactTexture.needsUpdate = true;
  coastalImpactUniforms.active.value = 0;
}

export function sampleCoastalRockImpactState() {
  const uv = positionWorld.xz.sub(coastalImpactUniforms.renderOrigin)
    .mul(coastalImpactUniforms.inverseSpan);
  const width = coastalImpactUniforms.fadeFraction;
  const inside = smoothstep(0, width, uv.x).mul(smoothstep(0, width, uv.y))
    .mul(oneMinus(smoothstep(oneMinus(width), 1, uv.x)))
    .mul(oneMinus(smoothstep(oneMinus(width), 1, uv.y)));
  const state = texture(coastalImpactTexture, uv).level(0);
  const weight = inside.mul(coastalImpactUniforms.active);
  return {
    foam: state.r.mul(weight),
    wetness: state.g.mul(weight),
    runoff: state.b.mul(weight),
    pulse: state.a.mul(weight),
  };
}
