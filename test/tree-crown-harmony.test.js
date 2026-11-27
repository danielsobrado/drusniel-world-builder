import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import yaml from 'js-yaml';
import * as THREE from 'three/webgpu';
import { float, normalWorld, positionGeometry, uniform, vec3 } from 'three/tsl';
import {
  crownLocalGroundBounce,
  foliageLight,
  syncFoliageLight,
  treeFoliageAtmosphereEmission,
  treeFoliageSurfaceEmission,
} from '../src/editor/stylized/forest/foliageLight.js';
import {
  applyCrownProfileNormals,
  crownMacroNormalNode,
  resolveCrownProfileKey,
  resolveCrownProfiles,
} from '../src/editor/stylized/forest/crownProfile.js';
import { createTreeProxyPrototype } from '../src/editor/stylized/lod/StylizedProxyGeometry.js';
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

test('shared crownProfile drives near macro normals, proxy geometry budget, and impostor normal blend', () => {
  assert.equal(resolveCrownProfileKey('conifer_evergreen'), 'conifer');
  assert.equal(resolveCrownProfileKey('broadleaf_tall'), 'columnar');
  assert.equal(resolveCrownProfileKey('tropical_tall'), 'spreading');
  assert.equal(resolveCrownProfileKey('wetland_sparse'), 'sparse');
  assert.equal(resolveCrownProfileKey('broadleaf_round'), 'broadleaf');

  const profiles = resolveCrownProfiles(config.trees);
  const bounds = { min: [-2, 1, -2], max: [2, 9, 2] };
  const sampleValues = new Map([[positionGeometry, [1.5, 5.2, 0.2]]]);
  const broadleafNormal = evaluate(crownMacroNormalNode(bounds, profiles.broadleaf), { values: sampleValues });
  const coniferNormal = evaluate(crownMacroNormalNode(bounds, profiles.conifer), { values: sampleValues });
  const diff = Math.hypot(
    broadleafNormal[0] - coniferNormal[0],
    broadleafNormal[1] - coniferNormal[1],
    broadleafNormal[2] - coniferNormal[2],
  );
  assert.ok(diff > 0.05, 'broadleaf ellipsoid and conifer tiered-cone compute distinct macro normals');

  const box = new THREE.BoxGeometry(2, 6, 2);
  applyCrownProfileNormals(box, bounds, profiles.conifer);
  assert.ok(box.getAttribute('normal').count > 0);
  box.dispose();

  const makeMaterialFor = species => createStylizedLeafMaterial({
    source: new THREE.MeshLambertMaterial(),
    leafMap: null,
    bounds: { minY: 1, maxY: 9 },
    time: uniform(0),
    config,
    species,
    canopyBounds: bounds,
  });

  const broadleafMat = makeMaterialFor('broadleaf_round');
  const coniferMat = makeMaterialFor('conifer_narrow');
  assert.equal(broadleafMat.userData.crownProfileKey, 'broadleaf');
  assert.equal(coniferMat.userData.crownProfileKey, 'conifer');

  const bakeNormalConifer = createTreeImpostorBakeMaterial({ kind: 'leaf', material: coniferMat }, true);
  assert.equal(bakeNormalConifer.foliageNormalBlendNode.value, coniferMat.userData.treeFoliageSurface.impostorNormalBlend);
  bakeNormalConifer.dispose();

  const trunk = new THREE.CylinderGeometry(0.2, 0.3, 4);
  trunk.translate(0, 2, 0);
  const leafSrcBroadleaf = new THREE.BoxGeometry(4, 8, 4);
  leafSrcBroadleaf.translate(0, 5, 0);
  const leafSrcConifer = new THREE.ConeGeometry(2.2, 8, 8);
  leafSrcConifer.translate(0, 5, 0);

  const broadleafProxy = createTreeProxyPrototype([
    { kind: 'leaf', geometry: leafSrcBroadleaf, material: broadleafMat },
    { kind: 'trunk', geometry: trunk },
  ], config);
  const coniferProxy = createTreeProxyPrototype([
    { kind: 'leaf', geometry: leafSrcConifer, material: coniferMat },
    { kind: 'trunk', geometry: trunk },
  ], config);

  const broadleafLeaf = broadleafProxy.proxyParts.find(p => p.kind === 'leaf');
  const coniferLeaf = coniferProxy.proxyParts.find(p => p.kind === 'leaf');
  assert.equal(broadleafLeaf.geometry.userData.crownProfileKey, 'broadleaf');
  assert.equal(coniferLeaf.geometry.userData.crownProfileKey, 'conifer');
  // Baseline 4-dodecahedron proxy was 432 vertices; stay strictly below +20% (518 vertices).
  assert.ok(broadleafLeaf.geometry.getAttribute('position').count <= 518, 'broadleaf proxy stays within +20% vertex budget');
  assert.ok(coniferLeaf.geometry.getAttribute('position').count <= 518, 'conifer proxy stays within +20% vertex budget');

  for (const proxy of [broadleafProxy, coniferProxy]) {
    for (const part of proxy.proxyParts) {
      part.geometry.dispose();
      part.material.dispose();
    }
  }
  broadleafMat.dispose();
  coniferMat.dispose();
  trunk.dispose();
  leafSrcBroadleaf.dispose();
  leafSrcConifer.dispose();
});
