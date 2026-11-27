import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import yaml from 'js-yaml';
import * as THREE from 'three/webgpu';
import { float } from 'three/tsl';
import { coatCoverageOf, publishCoatCoverage } from '../src/editor/stylized/surfaceCoatings/CoatCoverage.js';
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
  assert.ok(coatCoverageOf(rock).moss && coatCoverageOf(rock).snow, 'rock: moss and snow');

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
