import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import yaml from 'js-yaml';
import * as THREE from 'three/webgpu';
import { float, vec3 } from 'three/tsl';
import { rainOnObject, wetCoat } from '../src/editor/stylized/surfaceCoatings/WetCoat.js';
import { surfaceWetnessUniform } from '../src/editor/weather/surfaceWetness.js';
import { evaluateShaderNode as evaluate } from '../test/helpers/evaluateShaderNode.js';
import { coatCoverageOf, inheritCoatCoverage, publishCoatCoverage } from '../src/editor/stylized/surfaceCoatings/CoatCoverage.js';
import { SURFACE_COATING_DEFAULTS, resolveSurfaceCoatings } from '../src/editor/stylized/surfaceCoatings/SurfaceCoatingConfig.js';
import { applyBarkWeathering, resolveBarkWeathering } from '../src/editor/stylized/barkWeathering.js';
import { applyRockWeathering, resolveRockWeathering } from '../src/editor/stylized/rockWeathering.js';
import { createAlpineRockMaterial } from '../src/editor/stylized/alpine/AlpineRockMaterial.js';
import { deadwoodMaterial } from '../src/editor/stylized/forest/forestDebrisPrototypes.js';
import { createProceduralBarkTextures } from '../src/editor/stylized/forest/ProceduralBarkTextures.js';
import { WSC_DIAGNOSTIC_MODES } from '../src/editor/performance/qa/wscDiagnosticModes.js';

const config = () => yaml.load(readFileSync(new URL('../editor.config.yaml', import.meta.url), 'utf8'));

test('PR 8 coat coverage is published per layer and merged, never guessed', () => {
  const material = new THREE.MeshStandardNodeMaterial();
  assert.deepEqual(coatCoverageOf(material), {});
  const moss = float(0.3);
  const snow = float(0.6);
  publishCoatCoverage(material, { moss });
  publishCoatCoverage(material, { snow, wet: null });
  const coverage = coatCoverageOf(material);
  assert.equal(coverage.moss, moss, 'an earlier layer is kept');
  assert.equal(coverage.snow, snow);
  assert.equal(coverage.wet, undefined, 'a null layer is not published');
  assert.ok(Object.isFrozen(coverage));
  assert.throws(() => publishCoatCoverage(material, { snow: 0.5 }), /TSL node/);
});

test('PR 8 a cloned material carries real coverage only when it inherits it', () => {
  const source = new THREE.MeshStandardNodeMaterial();
  publishCoatCoverage(source, { snow: float(0.4) });
  // clone() deep-copies userData through JSON; coverage must not ride there as dead objects.
  const plain = source.clone();
  assert.deepEqual(coatCoverageOf(plain), {});
  assert.equal(JSON.stringify(plain.userData).includes('snow'), false);
  const inherited = inheritCoatCoverage(source, source.clone());
  assert.equal(coatCoverageOf(inherited).snow, coatCoverageOf(source).snow);
  assert.ok(coatCoverageOf(inherited).snow.isNode);
});

test('PR 8 every coated surface publishes the coats it lays', () => {
  const surface = config().stylizedSurface;
  const band = config().world.farTerrain;

  const rock = new THREE.MeshStandardNodeMaterial();
  applyRockWeathering(rock, {
    settings: resolveRockWeathering(surface.rocks.weathering),
    biomeLook: true,
    ground: { groundY: 0.1, height: 1.2, centre: [0, 0.5, 0] },
  });
  assert.ok(coatCoverageOf(rock).moss && coatCoverageOf(rock).snow && coatCoverageOf(rock).wet, 'rock: moss, snow and rain');

  const bark = new THREE.MeshStandardNodeMaterial();
  applyBarkWeathering(bark, { settings: resolveBarkWeathering(surface, { snow: band }) });
  const barkCoverage = coatCoverageOf(bark);
  assert.ok(barkCoverage.moss && barkCoverage.snow && barkCoverage.wet, 'bark: moss, snow and wet');
  // Trunk snow is a coat now (roughness and normal), not a colour mix.
  assert.ok(bark.roughnessNode, 'trunk snow sets the roughness');

  const { material: log } = deadwoodMaterial(createProceduralBarkTextures({ profile: 'beech', resolution: 16 }), {});
  const logCoverage = coatCoverageOf(log);
  assert.ok(logCoverage.moss && logCoverage.snow && logCoverage.wet, 'deadwood: moss, snow and wet');

  assert.ok(coatCoverageOf(createAlpineRockMaterial()).snow, 'alpine crag: snow');
});

test('PR 8 one moss palette, validated, and D22 reads real coverage', () => {
  const shipped = resolveSurfaceCoatings(config().stylizedSurface.surfaceCoatings);
  assert.deepEqual(shipped.moss.palette, { ...SURFACE_COATING_DEFAULTS.moss.palette });
  assert.equal(resolveSurfaceCoatings({ moss: { palette: { light: '#6a7a44' } } }).moss.palette.deep, '#2f3d21');
  assert.throws(() => resolveSurfaceCoatings({ moss: { palette: { dark: 'green' } } }), /#rrggbb/);
  assert.throws(() => resolveSurfaceCoatings({ moss: { palette: { teal: '#00ffff' } } }), /palette\.teal/);
  // No material keeps a moss palette of its own.
  for (const file of ['stylized/rockWeathering.js', 'stylized/barkWeathering.js', 'stylized/forest/forestDebrisPrototypes.js']) {
    const source = readFileSync(new URL(`../src/editor/${file}`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /#5e7f2f|#8fae4b|MOSS_(DEEP|DARK|LIGHT)\b/, file);
  }
  assert.equal(WSC_DIAGNOSTIC_MODES.D22.supported, true);
});

test('PR 8 the wet coat: one rule for every surface, floored, glossier only, optional film', () => {
  const coats = resolveSurfaceCoatings({}, { canopyShelter: 0.5 });
  assert.equal(coats.wet.canopyShelter, 0.5, 'objects share the canopy shelter of the terrain');
  const base = { color: vec3(0.5, 0.4, 0.3), roughness: float(0.9) };
  const at = (amount, extra = {}, settings = coats) => wetCoat(base, { amount: float(amount), darkening: 0.3, roughness: 0.3, ...extra }, settings);
  assert.deepEqual(evaluate(at(0).color), evaluate(base.color), 'dry: untouched');
  const soaked = at(1);
  assert.ok(Math.abs(evaluate(soaked.color)[0] - 0.35) < 1e-6, 'darkens by porosity');
  assert.ok(Math.abs(evaluate(soaked.roughness) - 0.3) < 1e-6, 'takes the film roughness');
  const floored = at(1, { soak: float(0.6) });
  assert.ok(Math.abs(evaluate(floored.color)[0] - 0.5 * coats.wet.albedoFloor) < 1e-6, 'never below the floor');
  const glossy = wetCoat({ color: base.color, roughness: float(0.1) }, { amount: float(1), darkening: 0.5, roughness: 0.3 }, coats);
  assert.ok(Math.abs(evaluate(glossy.roughness) - 0.1) < 1e-6, 'roughness only falls');
  assert.equal(at(1, { roughness: null }).roughness, base.roughness, 'no film: roughness left to a later pass');
  const off = { ...coats, wet: { ...coats.wet, enabled: false } };
  assert.equal(at(1, {}, off), base, 'disabled: the surface as it was');
});

test('PR 8 rain reaches an object as it reaches the floor under the same canopy', () => {
  const coats = resolveSurfaceCoatings({}, { canopyShelter: 0.7 });
  const previous = surfaceWetnessUniform.value;
  surfaceWetnessUniform.value = 1;
  try {
    assert.ok(Math.abs(evaluate(rainOnObject(float(0), coats)) - 1) < 1e-6, 'in the open: all the rain');
    assert.ok(Math.abs(evaluate(rainOnObject(float(1), coats)) - 0.3) < 1e-6, 'under a closed canopy: what the floor gets');
  } finally {
    surfaceWetnessUniform.value = previous;
  }
});

test('PR 8 no surface keeps a wet model of its own', () => {
  // Each still decides where it is wet; how wet looks is WetCoat.js.
  for (const file of ['editor/stylized/rockWeathering.js', 'editor/stylized/barkWeathering.js',
    'editor/stylized/forest/forestDebrisPrototypes.js', 'editor/stylized/lod/StylizedProxyGeometry.js',
    'editor/stylized/RainWetnessShading.js', 'render/materials/townWetness.js']) {
    const source = readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8');
    assert.match(source, /wetCoat\(/, `${file} soaks through the wet coat`);
    assert.doesNotMatch(source, /surfaceWetnessUniform\.mul/, `${file}: objects take rain through rainOnObject`);
  }
});
