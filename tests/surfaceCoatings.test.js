import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import yaml from 'js-yaml';
import * as THREE from 'three/webgpu';
import { float, vec3 } from 'three/tsl';
import { evaluateShaderNode as evaluate } from '../test/helpers/evaluateShaderNode.js';
import { buildShader, shaderTestRenderer } from '../test/helpers/buildShader.js';
import { blendCoat } from '../src/render/materials/surfaceLayers/PbrCoatBlend.js';
import { mossCoat } from '../src/editor/stylized/surfaceCoatings/MossCoat.js';
import { mossGrowth } from '../src/editor/stylized/surfaceCoatings/MossGrowthMask.js';
import {
  SURFACE_COATING_DEFAULTS, resolveSurfaceCoatings,
} from '../src/editor/stylized/surfaceCoatings/SurfaceCoatingConfig.js';
import { acquireSnowTextures } from '../src/editor/assets/godsEnd/snowTextures.js';
import { applyRockWeathering, resolveRockWeathering } from '../src/editor/stylized/rockWeathering.js';
import { snowSettlementMaterial } from '../src/editor/world/settlements/view/SettlementSnow.js';
import { gradeTownMaterial } from '../src/render/materials/townGrade.js';

const close = (actual, expected) => [expected].flat().forEach((value, i) =>
  assert.ok(Math.abs([actual].flat()[i] - value) < 1e-6, `${actual} != ${expected}`));

test('the shipped coatings resolve, and bad values are refused', () => {
  const shipped = yaml.load(readFileSync(new URL('../editor.config.yaml', import.meta.url), 'utf8'))
    .stylizedSurface.surfaceCoatings;
  assert.deepEqual(resolveSurfaceCoatings(shipped), JSON.parse(JSON.stringify(SURFACE_COATING_DEFAULTS)));
  assert.equal(resolveSurfaceCoatings({ moss: { enabled: false } }).moss.roughness, 0.95);
  assert.throws(() => resolveSurfaceCoatings({ snow: { roughness: 2 } }), RangeError);
  assert.throws(() => resolveSurfaceCoatings({ moss: { enabled: 'yes' } }), TypeError);
  assert.throws(() => resolveSurfaceCoatings({ moss: { pillowHeight: 0.5 } }), RangeError);
  assert.throws(() => resolveSurfaceCoatings({ detail: { nearDistance: 80, farDistance: 60 } }), RangeError);
});

test('a coat leaves its base untouched where it has no coverage and replaces it at full', () => {
  const base = { color: vec3(0.2, 0.3, 0.4), roughness: float(0.5), metalness: float(0.7), normal: vec3(0, 0, 1) };
  const coat = { color: vec3(0.9), roughness: float(0.85), metalness: float(0), normal: vec3(0.6, 0, 0.8) };
  const none = blendCoat(base, coat, float(0));
  close(evaluate(none.color), [0.2, 0.3, 0.4]);
  close(evaluate(none.roughness), 0.5);
  close(evaluate(none.metalness), 0.7);
  close(evaluate(none.normal), [0, 0, 1]);
  const full = blendCoat(base, coat, float(1.4));
  close(evaluate(full.color), [0.9, 0.9, 0.9]);
  close(evaluate(full.metalness), 0);
  close(evaluate(full.normal), [0.6, 0, 0.8]);
  const half = evaluate(blendCoat(base, coat, float(0.5)).normal);
  close(Math.hypot(...half), 1);
  // A coat without a normal keeps the base's own node, so callers can leave normalNode alone.
  assert.equal(blendCoat(base, { color: coat.color, roughness: coat.roughness }, float(1)).normal, base.normal);
});

test('moss grows nowhere without potential, and potential widens patches rather than tinting them', () => {
  const at = (field, potential) => evaluate(mossGrowth({ field: float(field), potential: float(potential), sparse: 0.8, dense: 0.44, edge: 0.07 }));
  assert.equal(at(5, 0), 0);
  close(at(0.9, 1), 1);
  close(at(0.3, 1), 0);
  // A dry stone (low potential) still grows full moss where its field clears the higher bar.
  close(at(0.95, 0.3), 1);
  close(at(0.6, 0.3), 0);
});

test('a disabled moss coat passes its colour through and adds no normal', () => {
  const settings = resolveSurfaceCoatings({ moss: { enabled: false } });
  const layer = mossCoat({ color: vec3(0.3), pillow: float(0.5), tuft: float(0.5), settings });
  close(evaluate(layer.color), [0.3, 0.3, 0.3]);
  assert.equal(layer.roughness, null);
  assert.equal(layer.normal(vec3(0, 0, 1)), null);
  const lit = mossCoat({ color: vec3(0.3), pillow: float(1), tuft: float(1) });
  // Cushion tops keep the painted colour; the low ground between them is shaded.
  close(evaluate(lit.color), [0.3, 0.3, 0.3]);
  close(evaluate(mossCoat({ color: vec3(0.3), pillow: float(0), tuft: float(0) }).color), [0.21, 0.21, 0.21]);
});

/** Snow textures with a stand-in loader, so the snow coat compiles without an image decoder. */
function withSnowTextures(run) {
  const maps = acquireSnowTextures({ loader: { load: () => {
    const texture = new THREE.DataTexture(new Uint8Array(4 * 4 * 4).fill(128), 4, 4);
    texture.needsUpdate = true;
    return texture;
  } } });
  try {
    run();
  } finally {
    maps.release();
  }
}

function instanced(material, attributes) {
  const geometry = new THREE.BoxGeometry();
  for (const [name, size] of Object.entries(attributes)) {
    geometry.setAttribute(name, new THREE.InstancedBufferAttribute(new Float32Array(size), size));
  }
  return new THREE.InstancedMesh(geometry, material, 1);
}

for (const forceWebGL of [false, true]) {
  const backend = forceWebGL ? 'WebGL' : 'WebGPU';

  test(`mossy, snowy rocks and towns compile for ${backend}`, () => withSnowTextures(() => {
    const rock = new THREE.MeshStandardNodeMaterial();
    rock.flatShading = true;
    applyRockWeathering(rock, { settings: resolveRockWeathering(), biomeLook: true,
      ground: { groundY: -0.5, height: 1, centre: [0, 0, 0] } });
    assert.ok(rock.normalNode, 'rock coats perturb the normal');
    const rockShader = buildShader(instanced(rock, { instanceDither: 3, instanceBiomeLook: 4 }),
      shaderTestRenderer({ forceWebGL })).fragmentShader;
    assert.match(rockShader, forceWebGL ? /dFdx/ : /dpdx/);

    const wall = new THREE.MeshStandardNodeMaterial();
    gradeTownMaterial(wall, 'stone');
    snowSettlementMaterial(wall, 'stone');
    assert.ok(wall.normalNode, 'town moss and snow perturb the normal');
    buildShader(instanced(wall, { instanceBiomeLook: 4 }), shaderTestRenderer({ forceWebGL }));
  }));
}

test('coats switched off leave the materials\' normals alone', () => withSnowTextures(() => {
  const off = resolveSurfaceCoatings({ snow: { enabled: false }, moss: { enabled: false } });
  const wall = new THREE.MeshStandardNodeMaterial();
  snowSettlementMaterial(wall, 'roof', off);
  assert.equal(wall.normalNode, null);
  // Glass holds no snow at all.
  const glass = new THREE.MeshStandardNodeMaterial();
  snowSettlementMaterial(glass, 'glass');
  assert.equal(glass.colorNode, null);
}));
