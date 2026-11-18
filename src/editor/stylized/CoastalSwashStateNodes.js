import * as THREE from 'three/webgpu';
import { clamp, float, max, oneMinus, positionWorld, smoothstep, texture, uniform, vec2 } from 'three/tsl';
import { frameUniform } from '../../render/FrameUniforms.js';

const fallbackTexture = new THREE.DataTexture(
  new Uint16Array([0, 0, 0, 0]), 1, 1, THREE.RGBAFormat, THREE.HalfFloatType,
);
fallbackTexture.name = 'coastal-swash-fallback';
fallbackTexture.colorSpace = THREE.NoColorSpace;
fallbackTexture.needsUpdate = true;
let activeTexture = fallbackTexture;

export const coastalSwashUniforms = Object.freeze({
  renderOrigin: frameUniform(new THREE.Vector2()),
  inverseSpan: frameUniform(1 / 64),
  fadeFraction: frameUniform(4 / 64),
  active: frameUniform(0),
});

export function setCoastalSwashTexture(value) {
  activeTexture = value ?? fallbackTexture;
}

/** The same world-aligned state drives exposed sand and the sea's edge. */
export function sampleCoastalSwashState() {
  const texelUv = positionWorld.xz.sub(coastalSwashUniforms.renderOrigin)
    .mul(coastalSwashUniforms.inverseSpan);
  const edge = max(float(0.0001), coastalSwashUniforms.fadeFraction);
  const inside = smoothstep(0, edge, texelUv.x)
    .mul(smoothstep(0, edge, texelUv.y))
    .mul(oneMinus(smoothstep(oneMinus(edge), 1, texelUv.x)))
    .mul(oneMinus(smoothstep(oneMinus(edge), 1, texelUv.y)));
  const sample = texture(fallbackTexture, clamp(texelUv, vec2(0), vec2(1)));
  sample.setUpdateMatrix(false).onObjectUpdate(() => activeTexture);
  sample._matrixUniform = uniform(new THREE.Matrix3());
  const state = sample;
  return {
    wetness: state.r,
    film: state.g,
    mobileFoam: state.b,
    strandedFoam: state.a,
    activeWeight: inside.mul(coastalSwashUniforms.active),
  };
}
