import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveParticleBurst } from '../src/editor/stylized/ambient/ParticleBurst.js';
import { resolveAmbientEffectsConfig } from '../src/editor/stylized/ambient/ambientEffectsConfig.js';

test('burst authoring rejects unbounded lifetimes, growth and duty cycles', () => {
  const good = { lifetime: 1.4, expansion: 1.4, activeShare: 0.7 };
  assert.deepEqual(resolveParticleBurst(good, 'burst'), good);
  assert.equal(resolveParticleBurst(undefined, 'burst'), null);
  for (const value of [null, [], true, {}, { ...good, lifetime: Infinity },
    { ...good, expansion: 5 }, { ...good, activeShare: 0 }, { ...good, lifetime: '1.4' }]) {
    assert.throws(() => resolveParticleBurst(value, 'burst'), /burst/);
  }
});

test('burst settings survive the ambient authoring resolver; existing fields stay continuous', () => {
  const base = { area: 64, count: 420 };
  const burst = { lifetime: 1.4, expansion: 1.4, activeShare: 0.7 };
  const settings = resolveAmbientEffectsConfig({ fields: { spray: { ...base, burst }, pollen: base } });
  assert.deepEqual(settings.fields.find(f => f.name === 'spray').burst, burst);
  assert.equal(settings.fields.find(f => f.name === 'pollen').burst, null);
});
