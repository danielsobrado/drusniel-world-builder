import * as THREE from 'three/webgpu';
import { attribute, color, mix, normalGeometry, positionGeometry, texture, uv, vec3 } from 'three/tsl';

import { projectedUvAt } from '../../../workshop/WorkshopProjectedUv.js';
import { settlementDusk } from './SettlementDusk.js';
import { createWindowTable, windowLightEmission, windowLightNode } from './SettlementWindowLight.js';

/** Texel density of the timber grain on interior wood: a board or beam shows a few knots. */
const GRAIN_DENSITY = 1.4;
/**
 * Timber sets are stored neutral at a fixed mean (SettlementDressing, 196/255
 * in sRGB, about 0.55 linear): dividing it out keeps the vertex colour's
 * brightness, so the grain adds texture, not a shade.
 */
const GRAIN_GAIN = 1 / 0.55;
/** The fire's light on its own hearthstone and jambs, after dark. */
const FIRELIGHT = color('#ff8a33').mul(0.4);
/**
 * The rooms and open doorways of one town as a mesh (SettlementInteriorGeometry).
 * Lit like everything else, with a little light of its own — a room is never as
 * black as its shadow — that warms as the evening fires are lit. Wood is plain
 * colour until the town's timber set loads (`dressInteriorTimber`); each
 * hearth glows with its fire after dark.
 */
export function createInteriorMesh(arrays) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(arrays.positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(arrays.normals, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(arrays.colors, 3));
  geometry.setAttribute('interiorSurface', new THREE.BufferAttribute(arrays.surfaces, 3));
  const uvs = new Float32Array(arrays.positions.length / 3 * 2);
  for (let vertex = 0; vertex < uvs.length / 2; vertex += 1) {
    const o = vertex * 3;
    projectedUvAt(uvs, vertex * 2, arrays.positions[o], arrays.positions[o + 1], arrays.positions[o + 2],
      arrays.normals[o], arrays.normals[o + 1], arrays.normals[o + 2], GRAIN_DENSITY);
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.computeBoundingSphere();
  const material = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
  const surface = attribute('interiorSurface', 'vec3');
  const albedo = attribute('color', 'vec3');
  // Sun or moon through the windows: the leaded patch on the floor and walls.
  const windowTable = createWindowTable(arrays.rooms ?? []);
  const sunPatch = windowLightEmission({
    albedo,
    light: windowLightNode({ table: windowTable, room: surface.z, position: positionGeometry, normal: normalGeometry }),
  });
  material.emissiveNode = albedo.mul(settlementDusk.mul(0.3).add(0.2))
    .add(FIRELIGHT.mul(surface.y).mul(settlementDusk))
    .add(sunPatch);
  material.name = 'settlement-interiors';
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'settlement-interiors';
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.userData.skipWarmup = true;
  mesh.userData.windowTable = windowTable;
  return mesh;
}

/** Give the interior's wooden surfaces the town's timber grain. Once; recompiles the material. */
export function dressInteriorTimber(mesh, timber) {
  if (!mesh || !timber?.color || mesh.userData.timbered) return;
  const wood = attribute('interiorSurface', 'vec3').x;
  const grain = texture(timber.color, uv()).rgb.mul(GRAIN_GAIN);
  mesh.material.colorNode = mix(vec3(1), grain, wood);
  mesh.material.needsUpdate = true;
  mesh.userData.timbered = true;
}
