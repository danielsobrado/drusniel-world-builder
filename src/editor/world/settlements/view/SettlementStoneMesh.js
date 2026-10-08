import * as THREE from 'three/webgpu';
import { generateStone } from '@drusniel/procedural-stone';
import { STONE_PALETTES } from '../../../workshop/ProceduralWorkshopMaterials.js';
import { projectedUvAt } from '../../../workshop/WorkshopProjectedUv.js';
import { SETTLEMENT_STONES, stoneSeed } from '../SettlementStones.js';

/** Moss, as a linear vertex-colour multiplier over the neutral stone surface. */
const MOSS = Object.freeze([0.2, 0.3, 0.12]);
/** Texture repeats per unit of the (unit-sized) stone: a loose stone shows a patch, not a tile. */
const UV_DENSITY = 0.9;

/**
 * One pooled loose stone as a part the instanced renderers can draw.
 *
 * The stone library returns renderer-neutral arrays — shape plus per-vertex
 * tone, cavity and moss. Here they become vertex colour in the town's own stone
 * palette, exactly as the workshop's masonry carries it, over the same neutral
 * stone surface set: a boulder by the wall is the wall's stone.
 *
 * @param {{ kind: string, variant: number, style: { style: string }, surfaces?: { stone?: object } }} entry
 * @returns {Array<{ geometry: THREE.BufferGeometry, material: THREE.Material, matrix: THREE.Matrix4 }>}
 */
export function createSettlementStoneParts(entry) {
  const { archetype } = SETTLEMENT_STONES[entry.kind];
  const { mesh } = generateStone({ archetype, seed: stoneSeed(entry.kind, entry.variant) });
  const palette = STONE_PALETTES[entry.style.style] ?? STONE_PALETTES.granite;
  const count = mesh.positions.length / 3;
  const colors = new Float32Array(count * 3);
  const uvs = new Float32Array(count * 2);
  for (let vertex = 0; vertex < count; vertex += 1) {
    const offset = vertex * 3;
    // Tone runs light on worn faces; cavities sit in their own shadow.
    // Kept a shade under the dressed masonry: field stone is weathered, not cut.
    const shade = (0.46 + mesh.tones[vertex] * 0.42) * (1 - mesh.cavities[vertex] * 1.6);
    const moss = Math.min(1, mesh.mosses[vertex] * 0.9);
    for (let channel = 0; channel < 3; channel += 1) {
      const stone = palette.base[channel] / 255 * shade;
      colors[offset + channel] = Math.max(0, stone + (MOSS[channel] - stone) * moss);
    }
    projectedUvAt(uvs, vertex * 2, mesh.positions[offset], mesh.positions[offset + 1], mesh.positions[offset + 2],
      mesh.normals[offset], mesh.normals[offset + 1], mesh.normals[offset + 2], UV_DENSITY);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(mesh.positions), 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(mesh.normals), 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(mesh.indices), 1));
  const set = entry.surfaces?.stone ?? null;
  const material = new THREE.MeshStandardNodeMaterial({
    color: '#ffffff',
    map: set?.color ?? null,
    normalMap: set?.normal ?? null,
    roughnessMap: set?.arm ?? null,
    vertexColors: true,
    roughness: set ? 1 : 0.92,
    metalness: 0,
    envMapIntensity: 0.6,
  });
  material.userData.workshopSlot = 'stone';
  return [{ geometry, material, matrix: new THREE.Matrix4() }];
}
