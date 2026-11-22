import * as THREE from 'three/webgpu';
import {
  cameraPosition, clamp, color, dot, float, floor, fract, hash, length, max, min, mix, mod,
  normalize, positionWorld, pow, reflector, smoothstep, texture, vec2, vec3,
} from 'three/tsl';
import { locationLight } from './LocationShading.js';

/**
 * Polished dark-stone ceremonial floor with real-time WebGPU planar reflections,
 * flagstone joint breakup, mineral veining, and grazing Fresnel firelight sheen
 * driven by a packed RGB noise texture (`R`: marble vein, `G`: polish, `B`: micro-cracks).
 */
export function createReflectiveFloor({
  center,
  width,
  depth,
  y = 0.014,
  noiseMap,
  baseTint = '#171519',
  veinTint = '#614f3c',
  reflectivity = 0.78,
  resolutionScale = 0.5,
}) {
  const mirror = reflector({ resolutionScale });
  mirror.target.rotation.x = -Math.PI / 2;
  mirror.target.position.set(center.x, y, center.z);

  const worldXZ = positionWorld.xz;
  const broad = texture(noiseMap, worldXZ.mul(0.12));
  const fine = texture(noiseMap, worldXZ.mul(0.38).add(vec2(0.29, 0.61)));

  // Staggered ceremonial basalt flagstones (1.7 m x 1.2 m) so reflections break along mortar seams.
  const slabW = float(1.7);
  const slabD = float(1.2);
  const row = floor(worldXZ.y.div(slabD));
  const colRun = worldXZ.x.div(slabW).add(mod(row, 2).mul(0.5));
  const fu = fract(colRun);
  const fv = fract(worldXZ.y.div(slabD));
  const edge = min(min(fu, fu.oneMinus()).mul(slabW), min(fv, fv.oneMinus()).mul(slabD));
  const jointMask = smoothstep(0.012, 0.048, edge);
  const slabTone = hash(floor(colRun).add(row.mul(41.3)));

  // Dark veined stone body with subtle warm bronze-mineral veining.
  const veinMask = smoothstep(0.56, 0.88, broad.r.mul(0.65).add(fine.g.mul(0.35)));
  const slabBase = color(baseTint)
    .mul(mix(float(0.76), float(1.18), slabTone))
    .mul(mix(float(0.45), float(1.0), jointMask));
  const stoneColor = mix(slabBase, color(veinTint).mul(0.55), veinMask.mul(0.45).mul(jointMask));

  // Grazing Fresnel + per-slab polish breakup so mirror reflections shimmer organically (Ref 2).
  const toEye = normalize(cameraPosition.sub(positionWorld));
  const ndotv = clamp(toEye.y, 0.02, 1.0);
  const fresnel = float(0.42).add(float(0.58).mul(pow(float(1.0).sub(ndotv), 2.2)));
  const polish = clamp(
    broad.g.mul(0.55).add(fine.r.mul(0.3)).add(fine.b.oneMinus().mul(0.22)),
    0.35,
    1.0,
  ).mul(jointMask);

  // Direct flickering firelight specular pools across the polished slabs.
  let fireGlint = vec3(0);
  const slabNormal = normalize(vec3(
    fine.b.sub(0.5).mul(0.09),
    float(1.0),
    broad.r.sub(0.5).mul(0.09),
  ));
  for (const slot of locationLight.dynamicLights) {
    const toDyn = slot.position.sub(positionWorld);
    const dist = length(toDyn);
    const dir = toDyn.div(dist.max(1e-3));
    const range = max(slot.params.x, 1e-3);
    const radius = max(slot.params.y, 0.9);
    const fade = clamp(float(1).sub(pow(dist.div(range), 2)), 0, 1);
    const atten = fade.mul(fade).div(float(1).add(pow(dist.div(radius.mul(1.8)), 2)));
    const halfVec = normalize(dir.add(toEye));
    const tightSpec = pow(clamp(dot(slabNormal, halfVec), 0, 1), 46).mul(1.35);
    const broadSpec = pow(clamp(dot(slabNormal, halfVec), 0, 1), 10).mul(0.28);
    fireGlint = fireGlint.add(slot.color.mul(atten).mul(tightSpec.add(broadSpec)));
  }

  const reflWeight = clamp(fresnel.mul(polish).mul(reflectivity), 0.0, 0.94);
  const ambient = mix(locationLight.ambientDown, locationLight.ambientUp, float(0.65));
  const surfaceDiffuse = stoneColor.mul(ambient.mul(0.72).add(vec3(0.05, 0.04, 0.035)));
  const mirroredRgb = mirror.rgb.mul(mix(float(1.25), float(1.85), polish));

  const material = new THREE.MeshBasicNodeMaterial({
    name: 'location-reflective-floor',
    side: THREE.DoubleSide,
    fog: true,
  });
  material.colorNode = mix(surfaceDiffuse, mirroredRgb, reflWeight).add(fireGlint.mul(polish).mul(0.55));

  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), material);
  mesh.renderOrder = 1;
  mirror.target.add(mesh);

  return {
    root: mirror.target,
    dispose() {
      mesh.geometry.dispose();
      material.dispose();
      mirror.dispose?.();
    },
  };
}
