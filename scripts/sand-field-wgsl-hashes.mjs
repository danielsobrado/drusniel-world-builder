/**
 * Desert sand field off-switch proof (docs/plans/desert-sand-field-2026-11-22.md):
 * builds the WGSL of the shaders the sand field touches that compile without a
 * device (the shared storm field pass and the sandstorm's dust and haze), plus
 * the storm-snow readers it must leave alone, from a source tree, and prints a
 * hash of each.
 *
 *   node scripts/sand-field-wgsl-hashes.mjs [sourceRoot] [--sand on|off]
 *
 * Run it on this tree with `--sand off` and on the base tree (git archive into
 * tmp/) to show that off is byte-identical. The terrain needs a running app;
 * scripts/run-sand-field-review.mjs checks it in the browser.
 */
import { createHash } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as THREE from 'three/webgpu';
import { color } from 'three/tsl';
import { buildShader, shaderTestRenderer } from '../test/helpers/buildShader.js';

const args = process.argv.slice(2);
const root = path.resolve(args.find(arg => !arg.startsWith('--') && arg !== 'on' && arg !== 'off') ?? '.');
const sand = args.includes('--sand') ? args[args.indexOf('--sand') + 1] : 'off';
const load = file => import(pathToFileURL(path.join(root, file)).href);

const sandConfig = await load('src/editor/weather/storm/snowField/sandFieldConfig.js').catch(() => null);
const resolvedSand = sandConfig?.resolveSandFieldConfig({ enabled: sand === 'on' }) ?? null;
sandConfig?.registerSandFieldConfig(resolvedSand);
const snowConfig = await load('src/editor/weather/storm/snowField/snowFieldConfig.js');
const snow = snowConfig.resolveSnowFieldConfig({ enabled: true });
snowConfig.registerSnowFieldConfig(snow);
const { SnowFieldPass } = await load('src/editor/weather/storm/snowField/SnowFieldPass.js');
const { createSandstormNodeMaterial, createSandstormHazeNodeMaterial } = await load('src/editor/weather/rainNodeMaterial.js');
const { createAlpineRockMaterial } = await load('src/editor/stylized/alpine/AlpineRockMaterial.js');
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
const plane = material => new THREE.Mesh(new THREE.PlaneGeometry(), material);
const painted = hex => Object.assign(new THREE.MeshStandardNodeMaterial(), { colorNode: color(hex) });

const materials = {
  // Before the sand field the pass took no `sand` option; it is ignored there.
  stormField: () => plane(new SnowFieldPass({ config: snow, sand: resolvedSand, getHeight: () => 0 }).material),
  sandstormDust: () => plane(createSandstormNodeMaterial().material),
  sandstormHaze: () => plane(createSandstormHazeNodeMaterial().material),
  alpineRock: () => instanced(createAlpineRockMaterial(), { instanceSnow: 1 }),
  crown: () => instanced(createDitheredMaterial(painted(0x447733),
    { tinted: true, kind: 'leaf' }), { instanceDither: 3, instanceLeafTint: 4, instanceMorphology: 3 }),
};

const hash = text => createHash('sha256').update(text).digest('hex').slice(0, 12);
const out = { root, sand: sandConfig ? sand : 'absent' };
for (const [name, make] of Object.entries(materials)) {
  for (const forceWebGL of [false, true]) {
    const shader = buildShader(make(), shaderTestRenderer({ forceWebGL }));
    out[`${name}/${forceWebGL ? 'webgl' : 'webgpu'}`] = `${hash(shader.vertexShader)}:${hash(shader.fragmentShader)}`;
  }
}
console.log(JSON.stringify(out, null, 2));
