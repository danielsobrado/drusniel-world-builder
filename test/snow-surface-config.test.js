import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import yaml from 'js-yaml';
import { resolveSnowSurfaceConfig, SNOW_SURFACE_DEFAULTS } from '../src/editor/stylized/SnowSurfaceConfig.js';
import { validateStylizedLodConfig } from '../src/config/validateStylizedLodConfig.js';

test('snow surface tuning defaults match the authored config without mutating caller state', () => {
  const config = yaml.load(fs.readFileSync(new URL('../editor.config.yaml', import.meta.url), 'utf8'));
  assert.deepEqual(resolveSnowSurfaceConfig(config.stylizedSurface.snowSurface), SNOW_SURFACE_DEFAULTS);
  const source = Object.freeze({ calmCoverage: 0, subsurfaceStrength: 0 });
  const resolved = resolveSnowSurfaceConfig(source);
  assert.equal(resolved.calmCoverage, 0);
  assert.equal(resolved.subsurfaceStrength, 0);
  assert.equal(resolved.pathColor, '#a3b4c9');
});

test('snow appearance rejects invalid authoring values at the editor config boundary', () => {
  for (const source of [null, [], { calmScale: 0 }, { calmScale: Infinity }, { calmCoverage: -1 },
    { calmDetail: 2 }, { pathCompaction: NaN }, { baseRoughness: 2 }, { compactedRoughness: -0.1 }, { pathColor: 'blue' },
    { subsurfaceStrength: 1.1 }]) {
    assert.throws(() => validateStylizedLodConfig({ stylizedSurface: { enabled: true, snowSurface: source } }),
      /stylizedSurface\.snowSurface/);
  }
});
