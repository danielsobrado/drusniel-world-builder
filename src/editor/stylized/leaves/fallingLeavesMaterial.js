import { createFallingLeafTexture } from './FallingLeafTextures.js';
import * as THREE from 'three/webgpu';
import {
  attribute,
  cos,
  cross,
  dot,
  float,
  fract,
  mix,
  normalize,
  sin,
  step,
  texture,
  uniform,
  uv,
  vec2,
  vec3,
} from 'three/tsl';

import { skyLightUniforms } from '../sky/skyLight.js';

const TAU = Math.PI * 2;

/** Shared uniforms: the camera-centred box the leaves wrap in, time, wind, how many fall. */
export function createFallingLeavesUniforms({ boxSize, boxHeight }) {
  return {
    time: uniform(0),
    center: uniform(new THREE.Vector3()),
    wind: uniform(new THREE.Vector2()),
    amount: uniform(0),
    boxSize: uniform(boxSize),
    boxHeight: uniform(boxHeight),
  };
}

/** Rotate `v` about unit `axis` by `angle` (Rodrigues). */
function rotateAbout(v, axis, angle) {
  const c = cos(angle);
  const s = sin(angle);
  return v.mul(c).add(cross(axis, v).mul(s)).add(axis.mul(dot(axis, v)).mul(float(1).sub(c)));
}

/**
 * Every leaf's path is a function of its seed and time, so the CPU never
 * touches an instance. A leaf falls through a box around the camera and wraps
 * back to the top; its position wraps horizontally in world space, so leaves
 * stay put while the camera walks through them. Seeds above `amount` fold to
 * nothing, which is how density follows the canopy.
 *
 * Unlit, and dimmed by the sky's light like the water.
 */
export function createFallingLeavesMaterial(uniforms, { size, fallSpeed, palette }) {
  const corner = attribute('leafCorner', 'vec2');
  const seed = attribute('leafSeed', 'vec4');
  const { time, center, wind, amount, boxSize, boxHeight } = uniforms;

  const speed = mix(float(fallSpeed * 0.7), float(fallSpeed * 1.3), seed.z);
  const fall = fract(seed.w.add(time.mul(speed).div(boxHeight)));
  // Drift with the wind while falling, plus a lazy side-to-side swing.
  const swing = sin(time.mul(mix(0.8, 1.6, seed.x)).add(seed.y.mul(TAU))).mul(0.9);
  const drift = wind.mul(time.mul(0.6)).add(vec2(swing, swing.mul(0.6)));
  const anchor = vec2(seed.x, seed.y).mul(boxSize).add(drift);
  const offset = fract(anchor.sub(center.xz).div(boxSize)).sub(0.5).mul(boxSize);
  const origin = vec3(
    center.x.add(offset.x),
    center.y.add(boxHeight.mul(float(0.6).sub(fall))),
    center.z.add(offset.y),
  );

  const axis = normalize(vec3(seed.x.sub(0.5), seed.z.add(0.2), seed.y.sub(0.5)));
  const angle = time.mul(mix(1.5, 4, seed.z)).add(seed.w.mul(TAU));
  const visible = step(seed.w, amount);
  const scaled = vec3(corner.x, corner.y, 0).mul(size).mul(mix(0.7, 1.3, seed.x)).mul(visible);

  const material = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide });
  material.positionNode = origin.add(rotateAbout(scaled, axis, angle));

  const leafTexture = createFallingLeafTexture(palette);
  const leaf = texture(leafTexture, uv()).depth(seed.z.mul(3).floor().min(2));
  material.alphaTest = 0.5;
  material.opacityNode = leaf.a;
  material.colorNode = leaf.rgb.mul(mix(0.8, 1.05, seed.y)).mul(skyLightUniforms.brightness);
  material.userData.leafTexture = leafTexture;
  const dispose = () => {
    leafTexture.dispose();
    material.removeEventListener('dispose', dispose);
  };
  material.addEventListener('dispose', dispose);
  material.depthWrite = true;
  return material;
}
