import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import yaml from 'js-yaml';
import * as THREE from 'three/webgpu';
import { float, normalWorld, uniform, vec3 } from 'three/tsl';
import {
  crownLocalGroundBounce,
  foliageLight,
  syncFoliageLight,
  treeFoliageAtmosphereEmission,
  treeFoliageSurfaceEmission,
} from '../src/editor/stylized/forest/foliageLight.js';
import { createStylizedLeafMaterial } from '../src/editor/stylized/StylizedTreeMaterials.js';
import { createDitheredMaterial } from '../src/editor/stylized/lod/StylizedDitheredMaterial.js';
import { createTreeImpostorBakeMaterial } from '../src/editor/stylized/impostor/TreeImpostorBaker.js';
import { evaluateShaderNode as evaluate } from './helpers/evaluateShaderNode.js';
import { buildShader, shaderTestRenderer } from './helpers/buildShader.js';

const config = yaml.load(readFileSync(new URL('../editor.config.yaml', import.meta.url), 'utf8')).stylizedSurface;

function instancedLeafGeometry() {
  const geo = new THREE.CylinderGeometry(0.5, 0.8, 8, 8, 4);
  for (const [name, values] of Object.entries({
    instanceDither: [1, 0.42, 1],
    instanceMorphology: [1, 1, 1],
    instanceLeafTint: [2.2, 0.7, 0.25, 0],
  })) {
    geo.setAttribute(name, new THREE.InstancedBufferAttribute(new Float32Array(values), values.length));
  }
  return geo;
}

test('WSC local ground bounce falls back to hemisphere ground when invalid and adopts local terrain when valid', () => {
  syncFoliageLight({ hemisphere: new THREE.HemisphereLight('#a8c8e8', '#405030', 1) });
  try {
    const fallback = evaluate(crownLocalGroundBounce(vec3(0.5, 0.4, 0.3), float(0)));
    const expected = foliageLight.groundColor.value.toArray();
    fallback.forEach((c, i) => assert.ok(Math.abs(c - expected[i]) < 1e-5));

    const overStone = evaluate(crownLocalGroundBounce(vec3(0.42, 0.36, 0.28), float(1)));
    const overDuff = evaluate(crownLocalGroundBounce(vec3(0.06, 0.04, 0.02), float(1)));
    assert.ok(overStone[0] > overDuff[0] * 2.5, 'stone square reflects warmer/brighter bounce than dark forest duff');
  } finally {
    syncFoliageLight(null);
  }
});

test('tree crown materials promote Lambert donors to Standard IBL parity and separate untinted atmosphere', () => {
  const map = new THREE.DataTexture(new Uint8Array([90, 140, 70, 255]), 1, 1);
  const material = createStylizedLeafMaterial({
    source: new THREE.MeshLambertMaterial({ map }),
    leafMap: map,
    bounds: { minY: 0, maxY: 8 },
    crownRadius: 2.5,
    time: uniform(0),
    config,
    preserveSourceColor: true,
    canopyGrade: true,
    canopyBounds: { min: [-2, 0, -2], max: [2, 8, 2] },
  });
  assert.ok(material.isMeshStandardNodeMaterial, 'Lambert leaf donor promoted to Standard for IBL parity');
  assert.ok(material.foliageAtmosphereNode, 'atmosphere stored separately so leaf tint does not colour the sky rim/haze');
  assert.ok(material.userData.impostorAlbedoNode, 'clean crown albedo exposed for impostor bake');

  const bake = createTreeImpostorBakeMaterial({ kind: 'leaf', sourceMap: map, material }, false);
  assert.equal(bake.colorNode, material.userData.impostorAlbedoNode);

  const clone = createDitheredMaterial(material, { tinted: true, kind: 'leaf' });
  const geo = instancedLeafGeometry();
  const wgsl = buildShader(new THREE.InstancedMesh(geo, clone, 1));
  assert.doesNotMatch(wgsl.vertexShader, /dpdx|dpdy/);
  assert.doesNotMatch(wgsl.fragmentShader, /viewportDepth|viewportOpaque/);
  buildShader(new THREE.InstancedMesh(geo, clone, 1), shaderTestRenderer({ forceWebGL: true }));

  assert.ok(treeFoliageSurfaceEmission(vec3(0.3, 0.5, 0.2)));
  assert.ok(treeFoliageAtmosphereEmission(float(0.2)));
  syncFoliageLight({ hemisphere: new THREE.HemisphereLight('#a8c8e8', '#405030', 1) });
  try {
    const values = new Map([[normalWorld, [0, 1, 0]]]);
    const core = evaluate(treeFoliageSurfaceEmission(vec3(0.4, 0.5, 0.3), float(0)), { values });
    const outer = evaluate(treeFoliageSurfaceEmission(vec3(0.4, 0.5, 0.3), float(1)), { values });
    assert.ok(core[1] > core[0] * 1.4 && core[2] > core[0] * 0.9, 'core AO shifts toward saturated emerald/teal instead of dark grey');
    assert.ok(outer[1] > core[1], 'outer sky shell remains brighter than sheltered interior');
  } finally {
    syncFoliageLight(null);
  }
  bake.dispose();
  clone.dispose();
  material.dispose();
  geo.dispose();
  map.dispose();
});
