import assert from 'node:assert/strict';
import { buildShader } from '../test/helpers/buildShader.js';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import yaml from 'js-yaml';
import * as THREE from 'three/webgpu';
import { float, vec3 } from 'three/tsl';

import { groundFillLight } from '../src/editor/stylized/forest/foliageLight.js';
import { applyWorldSurfaceContact, isGroundLit } from '../src/editor/stylized/worldSurfaceContext/WorldSurfaceContactNodes.js';
import { resolveBarkWeathering } from '../src/editor/stylized/barkWeathering.js';
import { resolveRockWeathering } from '../src/editor/stylized/rockWeathering.js';
import { createAuthoredTrunkMaterial } from '../src/editor/stylized/StylizedTreeMaterials.js';
import { createStylizedRockMaterial } from '../src/editor/stylized/StylizedRockView.js';
import { cloneBushMaterial, createBushProxyPrototype } from '../src/editor/stylized/BushRenderAssets.js';
import { createForestDebrisPrototypes } from '../src/editor/stylized/forest/forestDebrisPrototypes.js';
import { createBiomeUnderstoryPrototypes } from '../src/editor/stylized/flora/biomeUnderstoryPrototypes.js';
import { createWinterVegetationMaterial } from '../src/editor/stylized/flora/winterVegetationPrototypes.js';
import { gradeTownMaterial } from '../src/render/materials/townGrade.js';
import { createTownKitMaterial } from '../src/editor/towns/TownKitMaterial.js';
import { createTreeProxyPrototype } from '../src/editor/stylized/lod/StylizedProxyGeometry.js';
import { evaluateShaderNode as evaluate } from '../test/helpers/evaluateShaderNode.js';

const stylizedConfig = yaml.load(readFileSync(new URL('../editor.config.yaml', import.meta.url), 'utf8')).stylizedSurface;

const floor = {
  height: float(10), normal: vec3(0, 1, 0), validity: float(1), inside: float(1),
  albedo: vec3(0.08, 0.14, 0.05), roughness: float(0.92), contact: float(0.75), canopy: float(0.8),
};
const own = vec3(0.3, 0.2, 0.1);
const albedo = vec3(0.2, 0.15, 0.1);
const close = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < 1e-5);

test('an object foot inside its contact band takes exactly the ground fill; above it keeps its own', () => {
  const at = (worldY, wsc = floor, extra = {}) => applyWorldSurfaceContact({
    surface: { color: albedo }, wsc, profile: 'tree', worldY: float(worldY), ...extra,
  });
  const ground = evaluate(groundFillLight(albedo, floor.canopy));
  // 10 cm under the ground line, below the band's start: the whole of the floor's light.
  assert.ok(close(evaluate(at(9.9).groundLight(own, albedo)), ground), 'at the foot: the floor\'s light');
  assert.ok(close(evaluate(at(12, { ...floor, canopy: float(0) }).groundLight(own, albedo)), evaluate(own)),
    'above the band, in the open: its own');
  assert.ok(close(evaluate(at(9.9, { ...floor, validity: float(0) }).groundLight(own, albedo)), evaluate(own)),
    'outside the WSC window: its own');
  assert.ok(close(evaluate(at(9.9, floor, { mask: float(0) }).groundLight(own, albedo)), ground),
    'a colour mask (snow-country rock, no soil collar) does not exempt the foot from the ground light');
});

test('under a canopy no object is lit by fill brighter than the floor; in the open it keeps its own', () => {
  const above = (canopy) => applyWorldSurfaceContact({
    surface: { color: albedo }, wsc: { ...floor, canopy: float(canopy) }, profile: 'rock', worldY: float(12),
  });
  const bright = vec3(2, 2, 2);
  const dim = vec3(0.001, 0.001, 0.001);
  assert.ok(close(evaluate(above(1).groundLight(bright, albedo)), evaluate(groundFillLight(albedo, float(1)))),
    'full canopy: a bright fill is capped at the floor fill');
  assert.ok(close(evaluate(above(1).groundLight(dim, albedo)), evaluate(dim)), 'a fill below the floor fill is untouched');
  assert.ok(close(evaluate(above(0).groundLight(bright, albedo)), evaluate(bright)), 'open ground: its own fill');
});

test('every family that meets the ground through the contact lights its foot as the ground', () => {
  const bark = createAuthoredTrunkMaterial({
    source: new THREE.MeshStandardMaterial({ color: '#6b533b' }),
    barkWeathering: resolveBarkWeathering(stylizedConfig),
  });

  const rockGeometry = new THREE.IcosahedronGeometry(1, 1);
  const rock = createStylizedRockMaterial(null, stylizedConfig, {
    settings: resolveRockWeathering({ ...stylizedConfig.rocks.weathering, soil: 0 }),
    seaLevel: 0,
  }, rockGeometry);

  const nearBush = cloneBushMaterial(new THREE.MeshStandardMaterial({ color: '#4d6f3b' }), {
    config: stylizedConfig, height: 1, bounds: { min: [0, 0, 0], max: [1, 1, 1] }, tileId: 8, biomeLook: true,
  });
  const bushGeometry = new THREE.BoxGeometry(1, 1, 1);
  bushGeometry.translate(0, 0.5, 0);
  bushGeometry.computeBoundingBox();
  const proxy = createBushProxyPrototype({ geometry: bushGeometry, material: nearBush, height: 1, prototypeId: 'gl-bush' }, {
    config: stylizedConfig, tileId: 8, biomeLook: true,
  });

  const debris = createForestDebrisPrototypes({
    variants: { fallenLog: { kind: 'fallenLog', barkProfile: 'spruce' }, mossMound: { kind: 'mossMound' } },
  }, { config: stylizedConfig }).map(def => [def.id, def.parts[0].material]);
  const flora = createBiomeUnderstoryPrototypes(stylizedConfig, {}).find(def => def.parts[0].kind === 'leaf');
  const town = new THREE.MeshStandardNodeMaterial();
  gradeTownMaterial(town, 'stone');

  const array = () => new THREE.DataArrayTexture(new Uint8Array([128, 128, 255, 255]), 1, 1, 1);
  const townKit = createTownKitMaterial({ albedo: array(), normal: array(), albedoLayer: () => 0,
    rows: [{ index: 0, name: 'M_stone', albedoLayer: 0, normalLayer: 0, roughness: 0.8, metalness: 0, color: [1, 1, 1], emissive: 0 }] },
  { key: 'qa', swaps: {}, tints: {}, wear: 0.2, snow: 0 });
  const proxyTrunk = createTreeProxyPrototype([
    { kind: 'leaf', geometry: new THREE.ConeGeometry(2, 5), material: new THREE.MeshLambertNodeMaterial() },
    { kind: 'trunk', geometry: new THREE.CylinderGeometry(0.2, 0.3, 5) },
  ], stylizedConfig).proxyParts.find(part => part.kind === 'trunk');

  const families = [
    ['tree bark', bark],
    ['rock without a soil collar', rock],
    ['authored shrub', nearBush],
    ['bush proxy', proxy.material],
    ...debris,
    ['biome understory', flora.parts[0].material],
    ['winter vegetation', createWinterVegetationMaterial(stylizedConfig, { bounds: { min: [0, 0, 0], max: [1, 0.6, 1] } })],
    ['town foundation', town],
    ['town kit', townKit],
    ['tree proxy trunk', proxyTrunk.material],
  ];
  for (const [name, material] of families) {
    assert.ok(isGroundLit(material), `${name}: its fill must go through the contact's groundLight`);
    // The contact and the spatial ambient (PR 9) each add varyings: stay inside the 16
    // inter-stage slots every WebGPU device guarantees.
    const { vertexShader } = buildShader(new THREE.Mesh(new THREE.BoxGeometry(), material));
    const varyings = vertexShader.match(/struct VaryingsStruct \{[^}]*\}/)?.[0].match(/@location/g)?.length ?? 0;
    assert.ok(varyings <= 16, `${name}: ${varyings} varyings`);
  }
});
