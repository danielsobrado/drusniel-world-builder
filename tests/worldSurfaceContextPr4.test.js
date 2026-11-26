import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import yaml from 'js-yaml';
import * as THREE from 'three/webgpu';
import { float, vec3 } from 'three/tsl';
import {
  WSC_CONTACT_DEFAULTS,
  WSC_CONTACT_PROFILE_NAMES,
  registerWorldSurfaceContactConfig,
  resolveContactProfile,
  resolveWorldSurfaceContactConfig,
  worldSurfaceContactConfig,
} from '../src/editor/stylized/worldSurfaceContext/WorldSurfaceContactConfig.js';
import { applyWorldSurfaceContact } from '../src/editor/stylized/worldSurfaceContext/WorldSurfaceContactNodes.js';
import { applyBarkWeathering, resolveBarkWeathering } from '../src/editor/stylized/barkWeathering.js';
import { applyRockWeathering, resolveRockWeathering } from '../src/editor/stylized/rockWeathering.js';
import { createAlpineRockMaterial } from '../src/editor/stylized/alpine/AlpineRockMaterial.js';
import { bakeSnowNormal } from '../src/editor/stylized/snowDeposition.js';
import { cloneBushMaterial, createBushProxyPrototype } from '../src/editor/stylized/BushRenderAssets.js';
import { createDitheredMaterial } from '../src/editor/stylized/lod/StylizedDitheredMaterial.js';
import { createForestDebrisPrototypes } from '../src/editor/stylized/forest/forestDebrisPrototypes.js';
import { createBiomeUnderstoryPrototypes } from '../src/editor/stylized/flora/biomeUnderstoryPrototypes.js';
import { buildShader } from '../test/helpers/buildShader.js';
import { evaluateShaderNode as evaluate } from '../test/helpers/evaluateShaderNode.js';

const rootConfig = yaml.load(readFileSync(new URL('../editor.config.yaml', import.meta.url), 'utf8'));
const stylizedConfig = rootConfig.stylizedSurface;
const contactYaml = yaml.load(readFileSync(new URL('../config/wsc-contact.yaml', import.meta.url), 'utf8'));

test('PR 4 config/wsc-contact.yaml resolves cleanly and validates all contact profile bounds', () => {
  const resolved = resolveWorldSurfaceContactConfig(contactYaml);
  assert.equal(resolved.enabled, true);
  for (const name of WSC_CONTACT_PROFILE_NAMES) {
    const p = resolveContactProfile(name, resolved);
    assert.ok(p.blendHeightMeters > 0 && p.blendHeightMeters <= 2, `${name} blendHeightMeters`);
    assert.ok(p.blendStartMeters < p.blendHeightMeters, `${name} blendStartMeters`);
    assert.ok(p.surfaceShare >= 0 && p.surfaceShare <= 1, `${name} surfaceShare`);
    assert.ok(p.roughnessShare >= 0 && p.roughnessShare <= 1, `${name} roughnessShare`);
    assert.ok(p.normalShare >= 0 && p.normalShare <= 1, `${name} normalShare`);
  }
  // Tree collar upgraded from the PR 0 abrupt 0.15 m cutoff (`DEF-06`).
  assert.ok(resolved.profiles.tree.blendHeightMeters >= 0.28);

  // Registration & override validation.
  const prev = worldSurfaceContactConfig();
  try {
    registerWorldSurfaceContactConfig(resolved);
    assert.deepEqual(worldSurfaceContactConfig().profiles.tree, resolved.profiles.tree);
    assert.throws(() => resolveWorldSurfaceContactConfig({ enabled: 'yes' }), TypeError);
    assert.throws(() => resolveWorldSurfaceContactConfig({ profiles: { tree: { blendHeightMeters: 0 } } }), RangeError);
    assert.throws(() => resolveWorldSurfaceContactConfig({ profiles: { rock: { surfaceShare: 1.5 } } }), RangeError);
    assert.throws(() => resolveContactProfile('nonexistent', resolved), RangeError);
  } finally {
    registerWorldSurfaceContactConfig(prev);
  }
});

test('PR 4 applyWorldSurfaceContact blends at contact, preserves identity above collar, and respects validity & disabled flags', () => {
  const cfg = resolveWorldSurfaceContactConfig(contactYaml);
  const baseColor = vec3(0.45, 0.28, 0.16); // warm bark/stone linear albedo
  const baseRoughness = float(0.62);
  const wscBase = {
    height: float(10),
    normal: vec3(0, 1, 0),
    validity: float(1),
    inside: float(1),
    albedo: vec3(0.08, 0.14, 0.05), // mossy forest floor linear albedo
    roughness: float(0.92),
    contact: float(0.75),
    canopy: float(0.6),
    litter: float(0.4),
  };

  // 1. At exact contact (worldY = 10.0 == wsc.height): blends strongly toward WSC albedo & roughness + orthogonal AO.
  const atContact = applyWorldSurfaceContact({
    surface: { color: baseColor, roughness: baseRoughness },
    wsc: wscBase,
    profile: 'tree',
    worldY: float(10.0),
    config: cfg,
  });
  const colAt = evaluate(atContact.color);
  const roughAt = evaluate(atContact.roughness);
  const aoAt = evaluate(atContact.contactAo);
  const maskAt = evaluate(atContact.contactMask);
  assert.ok(maskAt > 0.85, `expected strong contact mask at ground, got ${maskAt}`);
  assert.ok(colAt[0] < 0.25, `expected bark R blended toward floor at contact, got ${colAt[0]}`);
  assert.ok(roughAt > 0.82, `expected roughness blended toward WSC 0.92 at contact, got ${roughAt}`);
  assert.ok(aoAt < 0.85 && aoAt > 0.5, `expected bounded orthogonal contact AO, got ${aoAt}`);

  // 2. High above collar (worldY = 12.5 m, 2.5 m above ground): 100% authored material identity preserved!
  const highUp = applyWorldSurfaceContact({
    surface: { color: baseColor, roughness: baseRoughness },
    wsc: wscBase,
    profile: 'tree',
    worldY: float(12.5),
    config: cfg,
  });
  const colHigh = evaluate(highUp.color);
  assert.ok(Math.abs(colHigh[0] - 0.45) < 1e-5);
  assert.ok(Math.abs(colHigh[1] - 0.28) < 1e-5);
  assert.ok(Math.abs(colHigh[2] - 0.16) < 1e-5);
  assert.ok(Math.abs(evaluate(highUp.roughness) - 0.62) < 1e-5);
  assert.equal(evaluate(highUp.contactMask), 0);
  assert.equal(evaluate(highUp.contactAo), 1);

  // 3. Outside WSC window (validity = 0) with NO fallback: zero bogus soil blend!
  const invalidWsc = { ...wscBase, validity: float(0), inside: float(0), albedo: vec3(0, 0, 0) };
  const outsideNoFallback = applyWorldSurfaceContact({
    surface: { color: baseColor, roughness: baseRoughness },
    wsc: invalidWsc,
    profile: 'rock',
    worldY: float(10.0),
    applyAo: false,
    config: cfg,
  });
  assert.equal(evaluate(outsideNoFallback.coverage), 0);
  const colOut = evaluate(outsideNoFallback.color);
  assert.ok(Math.abs(colOut[0] - 0.45) < 1e-5);

  // 4. Disabled config: exact pass-through of base color & roughness.
  const disabledCfg = resolveWorldSurfaceContactConfig({ ...WSC_CONTACT_DEFAULTS, enabled: false });
  const disabled = applyWorldSurfaceContact({
    surface: { color: baseColor, roughness: baseRoughness },
    wsc: wscBase,
    profile: 'tree',
    worldY: float(10.0),
    config: disabledCfg,
  });
  assert.equal(evaluate(disabled.contactMask), 0);
  assert.equal(evaluate(disabled.contactAo), 1);
  assert.ok(Math.abs(evaluate(disabled.color)[0] - 0.45) < 1e-5);
  assert.ok(Math.abs(evaluate(disabled.roughness) - 0.62) < 1e-5);

  // 5. `applyAo: false` keeps color free of contactAo multiplication while still exposing `contactAo`.
  const noAo = applyWorldSurfaceContact({
    surface: { color: baseColor, roughness: baseRoughness },
    wsc: wscBase,
    profile: 'understory',
    worldY: float(10.0),
    applyAo: false,
    config: cfg,
  });
  const withAo = applyWorldSurfaceContact({
    surface: { color: baseColor, roughness: baseRoughness },
    wsc: wscBase,
    profile: 'understory',
    worldY: float(10.0),
    applyAo: true,
    config: cfg,
  });
  assert.ok(evaluate(noAo.color)[1] > evaluate(withAo.color)[1]);
});

test('PR 4 all migrated material families (tree bark, rock, alpine rock, bush, proxy, biome flora, deadwood, moss mound) compile cleanly to WGSL with WSC textureLoad', () => {
  // 1. Tree bark (`barkWeathering.js`)
  const barkGeo = new THREE.CylinderGeometry(0.4, 0.5, 4, 8);
  barkGeo.translate(0, 2, 0);
  barkGeo.setAttribute('instanceDither', new THREE.InstancedBufferAttribute(new Float32Array([1, 0.4, 1]), 3));
  const barkMat = applyBarkWeathering(new THREE.MeshStandardNodeMaterial({ color: '#6b533b', roughness: 0.88 }), {
    settings: resolveBarkWeathering(stylizedConfig),
  });
  const barkShader = buildShader(new THREE.InstancedMesh(barkGeo, barkMat, 1));
  assert.ok(barkShader.vertexShader.includes('textureLoad') && barkShader.fragmentShader.length > 0);

  // 2. Authored rock (`rockWeathering.js`)
  const rockGeo = bakeSnowNormal(new THREE.IcosahedronGeometry(1, 1));
  for (const [name, vals] of Object.entries({
    instanceDither: [1, 0.5, 1],
    instanceSurface: [0, 0, 0],
    instanceBiomeLook: [1, 1, 1, 1],
  })) {
    rockGeo.setAttribute(name, new THREE.InstancedBufferAttribute(new Float32Array(vals), vals.length));
  }
  const rockMat = applyRockWeathering(new THREE.MeshStandardNodeMaterial(), {
    settings: resolveRockWeathering(stylizedConfig.rocks.weathering),
    seaLevel: 0,
    localWater: true,
    biomeLook: true,
    ground: { smoothNormal: true, groundY: -0.7, height: 1.7, centre: [0, 0, 0] },
  });
  const rockShader = buildShader(new THREE.InstancedMesh(rockGeo, rockMat, 1));
  assert.ok(rockShader.vertexShader.includes('textureLoad') && rockShader.fragmentShader.length > 0);

  // 3. Alpine rock (`AlpineRockMaterial.js`)
  const alpineGeo = new THREE.IcosahedronGeometry(1, 1);
  alpineGeo.setAttribute('instanceSnow', new THREE.InstancedBufferAttribute(new Float32Array([0.2]), 1));
  const alpineShader = buildShader(new THREE.InstancedMesh(alpineGeo, createAlpineRockMaterial(), 1));
  assert.ok(alpineShader.vertexShader.includes('textureLoad') && alpineShader.fragmentShader.length > 0);

  // 4. Authored shrub + bush proxy (`AuthoredFoliageMaterial.js` + `BushRenderAssets.js`)
  const bushGeo = new THREE.BoxGeometry(1, 1, 1);
  bushGeo.translate(0, 0.5, 0);
  bushGeo.computeBoundingBox();
  for (const [name, vals] of Object.entries({
    instanceDither: [1, 0.4, 1],
    instanceBiomeLook: [1, 1, 1, 1],
    instancePlantRoot: [0, 0, 0],
  })) {
    bushGeo.setAttribute(name, new THREE.InstancedBufferAttribute(new Float32Array(vals), vals.length));
  }
  const nearBush = cloneBushMaterial(new THREE.MeshStandardMaterial({ color: '#4d6f3b' }), {
    config: stylizedConfig,
    height: 1,
    bounds: { min: [0, 0, 0], max: [1, 1, 1] },
    tileId: 8,
    biomeLook: true,
  });
  const nearBushShader = buildShader(new THREE.InstancedMesh(bushGeo, createDitheredMaterial(nearBush), 1));
  assert.ok(nearBushShader.vertexShader.includes('textureLoad') && nearBushShader.fragmentShader.length > 0);

  const proxy = createBushProxyPrototype({ geometry: bushGeo, material: nearBush, height: 1, prototypeId: 'pr4-bush' }, {
    config: stylizedConfig,
    tileId: 8,
    biomeLook: true,
  });
  for (const [name, vals] of Object.entries({
    instanceDither: [1, 0.4, 1],
    instanceBiomeLook: [1, 1, 1, 1],
    instancePlantRoot: [0, 0, 0],
  })) {
    proxy.geometry.setAttribute(name, new THREE.InstancedBufferAttribute(new Float32Array(vals), vals.length));
  }
  const proxyShader = buildShader(new THREE.InstancedMesh(proxy.geometry, createDitheredMaterial(proxy.material), 1));
  assert.ok(proxyShader.vertexShader.includes('textureLoad') && proxyShader.fragmentShader.length > 0);

  // 5. Forest debris deadwood (fallenLog) + moss mound (`forestDebrisPrototypes.js`)
  const debrisDefs = createForestDebrisPrototypes({
    variants: {
      fallenLog: { kind: 'fallenLog', barkProfile: 'spruce' },
      mossMound: { kind: 'mossMound' },
    },
  }, { config: stylizedConfig });
  assert.equal(debrisDefs.length, 2);
  for (const def of debrisDefs) {
    const part = def.parts[0];
    const geo = part.geometry.clone();
    geo.setAttribute('instanceDither', new THREE.InstancedBufferAttribute(new Float32Array([1, 0.3, 1]), 3));
    geo.setAttribute('instanceBiomeLook', new THREE.InstancedBufferAttribute(new Float32Array([1, 1, 1, 1]), 4));
    const shader = buildShader(new THREE.InstancedMesh(geo, part.material, 1));
    assert.ok(shader.vertexShader.includes('textureLoad'), `expected WSC textureLoad on ${def.id}`);
    assert.ok(shader.fragmentShader.length > 0, `expected valid fragment WGSL on ${def.id}`);
  }

  // 6. Biome understory living plant (`biomeUnderstoryPrototypes.js`)
  const floraDefs = createBiomeUnderstoryPrototypes(stylizedConfig, {});
  const living = floraDefs.find((d) => d.parts[0].kind === 'leaf');
  assert.ok(living);
  const floraGeo = living.parts[0].geometry.clone();
  floraGeo.setAttribute('instanceDither', new THREE.InstancedBufferAttribute(new Float32Array([1, 0.3, 1]), 3));
  floraGeo.setAttribute('instanceBiomeLook', new THREE.InstancedBufferAttribute(new Float32Array([1, 1, 1, 1]), 4));
  floraGeo.setAttribute('instancePlantRoot', new THREE.InstancedBufferAttribute(new Float32Array([0, 0, 0]), 3));
  const floraShader = buildShader(new THREE.InstancedMesh(floraGeo, living.parts[0].material, 1));
  assert.ok(floraShader.vertexShader.includes('textureLoad') && floraShader.fragmentShader.length > 0);
});
