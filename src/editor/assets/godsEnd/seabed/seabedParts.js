import * as THREE from 'three/webgpu';
import { color, mix, normalWorld, positionGeometry } from 'three/tsl';
import { createSeabedRockGeometry } from './seabedGeometry.js';
import { godsEndRockNoise2 } from './seabedNoiseNodes.js';

export function createGodsEndSeabedRockParts(asset) {
  const geometry = createSeabedRockGeometry(asset.variant);
  geometry.computeBoundingBox();
  const center = geometry.boundingBox.getCenter(new THREE.Vector3());
  geometry.translate(-center.x, 0, -center.z);
  const material = new THREE.MeshStandardNodeMaterial({ roughness: 0.92, metalness: 0 });
  material.name = 'Gods’ End seabed boulders';
  // Source mottling and upward-facing weed. Local coordinates keep a placed
  // boulder's procedural texture fixed across moves and floating-origin snaps.
  const tint = 0.5;
  const mottle = godsEndRockNoise2(positionGeometry.xz.mul(1.3).add(positionGeometry.y.mul(0.7))).mul(0.5).add(0.5);
  const rock = mix(color('#5d584e'), color('#7d7565'), mottle).mul(tint * 0.35 + 0.8);
  const weed = normalWorld.y.add(mottle.sub(0.5).mul(0.6)).smoothstep(0.15, 0.55);
  const weedColor = mix(color('#3f5a24'), color('#6f8d3a'), mottle.mul(tint));
  material.colorNode = mix(rock, weedColor, weed);
  return [{ geometry, material, matrix: new THREE.Matrix4() }];
}
