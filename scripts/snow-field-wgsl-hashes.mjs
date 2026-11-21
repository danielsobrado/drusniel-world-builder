/**
 * Storm snow field off-switch proof (docs/plans/storm-snow-field-2026-11-21.md):
 * builds the WGSL of the storm-snow coverage readers that compile without a
 * device, from a source tree, and prints a hash of each.
 *
 *   node scripts/snow-field-wgsl-hashes.mjs [sourceRoot] [--field on|off]
 *
 * Run it on this tree with `--field off` and on HEAD's tree (git archive into
 * tmp/) to show that off is byte-identical. The terrain and meadow materials
 * need a running app; the report checks those in the browser.
 */
import { createHash } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as THREE from 'three/webgpu';
import { color } from 'three/tsl';
import { buildShader, shaderTestRenderer } from '../test/helpers/buildShader.js';

const args = process.argv.slice(2);
const root = path.resolve(args.find(arg => !arg.startsWith('--') && arg !== 'on' && arg !== 'off') ?? '.');
const field = args.includes('--field') ? args[args.indexOf('--field') + 1] : 'off';
const load = file => import(pathToFileURL(path.join(root, file)).href);

const config = await load('src/editor/weather/storm/snowField/snowFieldConfig.js').catch(() => null);
config?.registerSnowFieldConfig(config.resolveSnowFieldConfig({ enabled: field === 'on' }));
const { createAlpineRockMaterial } = await load('src/editor/stylized/alpine/AlpineRockMaterial.js');
const { applyRockWeathering, resolveRockWeathering } = await load('src/editor/stylized/rockWeathering.js');
const { createDitheredMaterial } = await load('src/editor/stylized/lod/StylizedDitheredMaterial.js');
const { acquireSnowTextures } = await load('src/editor/assets/godsEnd/snowTextures.js');

acquireSnowTextures({ loader: { load: () => {
  const texture = new THREE.DataTexture(new Uint8Array(64).fill(128), 4, 4);
  texture.needsUpdate = true;
  return texture;
} } });

function instanced(material, attributes) {
  const geometry = new THREE.BoxGeometry();
  for (const [name, size] of Object.entries(attributes)) {
    geometry.setAttribute(name, new THREE.InstancedBufferAttribute(new Float32Array(size), size));
  }
  return new THREE.InstancedMesh(geometry, material, 1);
}

const painted = hex => Object.assign(new THREE.MeshStandardNodeMaterial(), { colorNode: color(hex) });
const materials = {
  alpineRock: () => instanced(createAlpineRockMaterial(), { instanceSnow: 1 }),
  rockWeathering: () => {
    const rock = new THREE.MeshStandardNodeMaterial();
    rock.flatShading = true;
    applyRockWeathering(rock, { settings: resolveRockWeathering(), biomeLook: true,
      ground: { groundY: -0.5, height: 1, centre: [0, 0, 0] } });
    return instanced(rock, { instanceDither: 3, instanceBiomeLook: 4 });
  },
  crown: () => instanced(createDitheredMaterial(painted(0x447733),
    { tinted: true, kind: 'leaf' }), { instanceDither: 3, instanceLeafTint: 4, instanceMorphology: 3 }),
  trunk: () => instanced(createDitheredMaterial(painted(0x664422),
    { kind: 'trunk' }), { instanceDither: 3, instanceMorphology: 3 }),
};

const hash = text => createHash('sha256').update(text).digest('hex').slice(0, 12);
const out = { root, field: config ? field : 'absent' };
for (const [name, make] of Object.entries(materials)) {
  for (const forceWebGL of [false, true]) {
    const shader = buildShader(make(), shaderTestRenderer({ forceWebGL }));
    out[`${name}/${forceWebGL ? 'webgl' : 'webgpu'}`] = `${hash(shader.vertexShader)}:${hash(shader.fragmentShader)}`;
  }
}
console.log(JSON.stringify(out, null, 2));
