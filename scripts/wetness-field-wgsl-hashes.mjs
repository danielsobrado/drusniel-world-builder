/**
 * Ground wetness field off-switch proof (docs/plans/wetness-field-*.md): builds,
 * without a device, the WGSL and GLSL of the wetness readers that compile from
 * a source tree — the rain film and puddles as the terrain wires them, and the
 * settlement paving — and prints a hash of each.
 *
 *   node scripts/wetness-field-wgsl-hashes.mjs [sourceRoot] [--field on|off]
 *
 * Run it on this tree with `--field off` and on the pre-field tree (git archive
 * into tmp/) to show that off is byte-identical. The full terrain material
 * needs a running app: run-wetness-field-qa.mjs --hashes checks it there.
 */
import { createHash } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as THREE from 'three/webgpu';
import { color, float, positionWorld, uniform, vec2 } from 'three/tsl';
import { buildShader, shaderTestRenderer } from '../test/helpers/buildShader.js';

const args = process.argv.slice(2);
const root = path.resolve(args.find((arg) => !arg.startsWith('--') && arg !== 'on' && arg !== 'off') ?? '.');
const field = args.includes('--field') ? args[args.indexOf('--field') + 1] : 'off';
const load = (file) => import(pathToFileURL(path.join(root, file)).href);

const registry = await load('src/editor/weather/wetness/wetnessField.js').catch(() => null);
registry?.registerWetnessField({ enabled: field === 'on' });
const { createRainWetnessShading } = await load('src/editor/stylized/RainWetnessShading.js');
const { createPuddleShading } = await load('src/editor/stylized/PuddleShading.js');
const { resolveSurfaceWetnessConfig } = await load('src/editor/weather/surfaceWetnessConfig.js');
const { createPavingMaterial } = await load('src/editor/world/settlements/paving/SettlementPavingMaterial.js');

const texture = () => Object.assign(new THREE.DataTexture(new Uint8Array(64).fill(128), 4, 4), { needsUpdate: true });
const mesh = (material, attributes = {}) => {
  const geometry = new THREE.BoxGeometry();
  for (const [name, size] of Object.entries(attributes)) {
    geometry.setAttribute(name, new THREE.BufferAttribute(new Float32Array(24 * size), size));
  }
  return new THREE.Mesh(geometry, material);
};

const materials = {
  // The terrain's wetness wiring (terrainMaterial.js), on stand-in inputs.
  groundWetness: () => {
    const material = new THREE.MeshStandardNodeMaterial();
    const rain = createRainWetnessShading({ snow: uniform(0), canopy: uniform(0), config: resolveSurfaceWetnessConfig() });
    const puddles = createPuddleShading({ shape: uniform(new THREE.Vector2(0.05, 0.02)), exposure: rain.exposure,
      water: uniform(0), worldXZ: vec2(positionWorld.xz), field: rain.field });
    const wet = rain.apply(color(0x806040), float(0.8), puddles.mask);
    material.colorNode = wet.color;
    material.roughnessNode = puddles.apply(wet.roughness);
    material.emissiveNode = puddles.reflection;
    return mesh(material);
  },
  paving: () => mesh(createPavingMaterial('cobble', { name: 'qa', color: texture(), normal: texture(), arm: texture() }, 'granite'),
    { pavingEdge: 1, color: 3 }),
};

const hash = (text) => createHash('sha256').update(text).digest('hex').slice(0, 12);
const out = { root, field: registry ? field : 'absent' };
for (const [name, make] of Object.entries(materials)) {
  for (const forceWebGL of [false, true]) {
    const shader = buildShader(make(), shaderTestRenderer({ forceWebGL }));
    out[`${name}/${forceWebGL ? 'webgl' : 'webgpu'}`] = `${hash(shader.vertexShader)}:${hash(shader.fragmentShader)}`;
  }
}
console.log(JSON.stringify(out, null, 2));
