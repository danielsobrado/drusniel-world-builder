import * as THREE from 'three/webgpu';
import { attribute, dot, fract, positionWorld, sin, smoothstep, step, texture, uv, vec2 } from 'three/tsl';
import { TOWN_GROUND } from '../view/SettlementGrade.js';

/** Paving wears a hint of the town's own stone over the photographed surface. */
const STONE_TINT = Object.freeze({
  granite: '#f4f0e8',
  limestone: '#fff4dc',
  sandstone: '#ffe2c6',
});
/**
 * Polygon offset per layer, on top of its geometric lift: distant paving
 * shares depth precision with the terrain a few centimetres beneath it.
 */
/** The earth photograph is darker than the tone it is tinted to; this brings the product back to it. */
const EARTH_LIFT = 1.75;
const DEPTH_BIAS = Object.freeze({ earth: -2, cobble: -3, flagstone: -4 });

/**
 * The occlusion layer's material: black, laid over the ground by how much sky a
 * vertex has lost (SettlementPavingGeometry.addShade). One for every town.
 */
export function createShadeMaterial() {
  const material = new THREE.MeshBasicNodeMaterial({
    color: '#0d0b09',
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -5,
    polygonOffsetUnits: -10,
  });
  material.opacityNode = attribute('pavingEdge', 'float').oneMinus().pow(2.2).mul(0.34);
  material.name = 'settlement-ground-shade';
  return material;
}

/**
 * The material of one paving layer in one surface set.
 *
 * @param {'earth'|'cobble'|'flagstone'} layer
 * @param {{ color: THREE.Texture, normal: THREE.Texture, arm: THREE.Texture }} set
 * @param {string} stoneStyle the settlement's stone, for the tint
 */
export function createPavingMaterial(layer, set, stoneStyle) {
  const material = new THREE.MeshStandardNodeMaterial({
    // Earth is the town's one ground tone — the same the walls are washed with at their feet.
    color: layer === 'earth'
      ? new THREE.Color().setRGB(TOWN_GROUND[0] * EARTH_LIFT, TOWN_GROUND[1] * EARTH_LIFT, TOWN_GROUND[2] * EARTH_LIFT)
      : (STONE_TINT[stoneStyle] ?? '#ffffff'),
    map: set.color,
    normalMap: set.normal,
    // Relief enough to read each stone, short of a photograph's every pore.
    normalScale: new THREE.Vector2(0.95, 0.95),
    // Packed AO / roughness / metalness: three reads AO from red, roughness from green.
    roughnessMap: set.arm,
    aoMap: set.arm,
    aoMapIntensity: 1,
    roughness: 1,
    metalness: 0,
    vertexColors: true,
    envMapIntensity: 0.6,
    polygonOffset: true,
    polygonOffsetFactor: DEPTH_BIAS[layer],
    polygonOffsetUnits: DEPTH_BIAS[layer] * 2,
  });
  // The border breaks up stone by stone: toward the edge only texels standing
  // proud survive — the occlusion map is dark in the joints, so those go first.
  // The cut is also scattered by a fine grain fixed in the world, so the edge is
  // a thinning of grit over a metre rather than a line: the paving runs out
  // into the grass, and one layer into the next, without a seam.
  const cut = smoothstep(0.05, 1, attribute('pavingEdge', 'float'));
  const grain = fract(sin(dot(positionWorld.xz.mul(31), vec2(12.9898, 78.233))).mul(43758.5453));
  material.opacityNode = step(cut, texture(set.arm, uv()).r.mul(0.38).add(grain.mul(0.58)).add(0.04));
  material.alphaTest = 0.5;
  material.name = `settlement-paving-${layer}-${set.name}`;
  return material;
}
