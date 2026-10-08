import * as THREE from 'three/webgpu';
import { attribute, smoothstep, step, texture, uv } from 'three/tsl';

/** Paving wears a hint of the town's own stone over the photographed surface. */
const STONE_TINT = Object.freeze({
  granite: '#eef1f3',
  limestone: '#fff4dc',
  sandstone: '#ffe2c6',
});
/**
 * Polygon offset per layer, on top of its geometric lift: distant paving
 * shares depth precision with the terrain a few centimetres beneath it.
 */
const DEPTH_BIAS = Object.freeze({ earth: -2, cobble: -3, flagstone: -4 });

/**
 * The material of one paving layer in one surface set.
 *
 * @param {'earth'|'cobble'|'flagstone'} layer
 * @param {{ color: THREE.Texture, normal: THREE.Texture, arm: THREE.Texture }} set
 * @param {string} stoneStyle the settlement's stone, for the tint
 */
export function createPavingMaterial(layer, set, stoneStyle) {
  const material = new THREE.MeshStandardNodeMaterial({
    color: layer === 'earth' ? '#cdbfae' : (STONE_TINT[stoneStyle] ?? '#ffffff'),
    map: set.color,
    normalMap: set.normal,
    normalScale: new THREE.Vector2(1.25, 1.25),
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
  const cut = smoothstep(0.25, 1, attribute('pavingEdge', 'float'));
  material.opacityNode = step(cut, texture(set.arm, uv()).r.mul(0.86).add(0.06));
  material.alphaTest = 0.5;
  material.name = `settlement-paving-${layer}-${set.name}`;
  return material;
}
