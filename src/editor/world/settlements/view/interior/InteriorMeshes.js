import * as THREE from 'three/webgpu';
import { attribute, mix, positionWorld, sin, texture, time, uv, vec3 } from 'three/tsl';
import { settlementDusk } from '../SettlementDusk.js';

/** What a room is never darker than: the little light that finds its way in anywhere. */
const AMBIENT = vec3(0.06, 0.055, 0.07);
/** Daylight through a window or a door, by day and once the sun is gone. */
const DAY = vec3(0.95, 1.0, 1.08);
const NIGHT = vec3(0.02, 0.03, 0.06);
/** Which of a town's surface sets each textured interior material wears. */
const SURFACE_ROLE = Object.freeze({ wood: 'timber', plaster: 'plaster', stone: 'stone' });

/**
 * Firelight is never still: two slow, unrelated beats, a little out of step
 * from one room to the next.
 */
function flicker() {
  const phase = positionWorld.x.mul(0.37).add(positionWorld.z.mul(0.53)).floor();
  return sin(time.mul(7.3).add(phase)).mul(sin(time.mul(11.9).add(phase.mul(1.7)))).mul(0.09).add(0.93);
}

/**
 * A room surface. Unlit by the scene — the sun does not reach indoors — and lit
 * instead by what was baked into its vertices (InteriorBuilder): the fire and
 * candles, and the daylight of its openings, which goes with the day.
 */
function litMaterial(set) {
  const material = new THREE.MeshBasicNodeMaterial();
  const tint = attribute('color', 'vec3');
  const base = set ? texture(set.color, uv()).rgb.mul(tint) : tint;
  const daylight = mix(DAY, NIGHT, settlementDusk).mul(attribute('sky', 'float'));
  material.colorNode = base.mul(AMBIENT.add(attribute('fire', 'vec3').mul(flicker())).add(daylight));
  return material;
}

function glowMaterial() {
  const material = new THREE.MeshBasicNodeMaterial();
  material.colorNode = attribute('color', 'vec3').mul(flicker());
  return material;
}

function skyMaterial() {
  const material = new THREE.MeshBasicNodeMaterial();
  material.colorNode = attribute('color', 'vec3').mul(mix(vec3(1, 1, 1), vec3(0.03, 0.045, 0.09), settlementDusk));
  return material;
}

function materialFor(key, surfaces) {
  if (key === 'glow') return glowMaterial();
  if (key === 'sky') return skyMaterial();
  // The doorway seen from the street stands in the sun like the house round it.
  if (key === 'exterior') return new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
  return litMaterial(SURFACE_ROLE[key] ? surfaces?.[SURFACE_ROLE[key]] ?? null : null);
}

/**
 * The rooms of one town as meshes, one per material.
 *
 * @param {Record<string, Record<string, Float32Array>>} arrays from `settlementInteriorArrays`
 * @param {?object} surfaces the town's surface sets, by role
 */
export function createInteriorMeshes(arrays, surfaces) {
  return Object.entries(arrays).map(([key, group]) => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(group.positions, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(group.normals, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(group.colors, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(group.uvs, 2));
    geometry.setAttribute('fire', new THREE.BufferAttribute(group.fire, 3));
    geometry.setAttribute('sky', new THREE.BufferAttribute(group.sky, 1));
    geometry.computeBoundingSphere();
    const material = materialFor(key, surfaces);
    material.name = `settlement-interior-${key}`;
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = material.name;
    mesh.receiveShadow = key === 'exterior';
    mesh.castShadow = false;
    // Not for the streamed draw-preparation queue: it hides what it has not reached.
    mesh.userData.skipWarmup = true;
    return mesh;
  });
}
