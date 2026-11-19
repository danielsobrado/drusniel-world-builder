import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { load } from 'js-yaml';

import { GrassTuning } from '../src/editor/stylized/GrassTuning.js';
import { resolveMeadowGrassConfig } from '../src/editor/stylized/meadow/meadowGrassConfig.js';
import {
  MEADOW_FLUTTER_MAX_GAIN,
  MEADOW_WIND_DEFAULTS,
  meadowFlutterGainNumber,
  meadowFlutterHeightNumber,
  meadowGustPressureNumber,
  meadowWindFrontNumber,
  resolveMeadowWind,
} from '../src/editor/stylized/meadow/meadowWindConfig.js';
import { createMeadowUniforms } from '../src/editor/stylized/meadow/meadowUniforms.js';

const surface = load(readFileSync(new URL('../editor.config.yaml', import.meta.url), 'utf8')).stylizedSurface;

test('wind-front settings resolve from YAML without modifying the weather wind field', () => {
  const settings = resolveMeadowGrassConfig(surface.grass.meadow);
  assert.deepEqual(settings.wind, MEADOW_WIND_DEFAULTS);
  const uniforms = createMeadowUniforms(settings);
  for (const [key, value] of Object.entries(settings.wind)) {
    assert.equal(uniforms.wind[key].value, value, `wind.${key}`);
  }
  assert.equal(resolveMeadowWind(), MEADOW_WIND_DEFAULTS);
  assert.deepEqual(resolveMeadowWind({ phaseJitter: 0 }), { ...MEADOW_WIND_DEFAULTS, phaseJitter: 0 });
});

test('invalid meadow wind settings fail clearly at configuration load', () => {
  for (const invalid of [null, false, [], 12, 'gust']) {
    assert.throws(() => resolveMeadowGrassConfig({ wind: invalid }), /meadow.wind/);
  }
  for (const [key, value] of [
    ['phaseJitter', -0.1],
    ['phaseJitter', 1.1],
    ['gustBoost', 2.1],
    ['secondaryStrength', 0.76],
    ['flutterGust', Infinity],
    ['unknown', 1],
  ]) {
    assert.throws(
      () => resolveMeadowGrassConfig({ wind: { [key]: value } }),
      new RegExp(`meadow\\.wind\\.${key}`),
    );
  }
});

test('coherent wavefront travels downwind and is deterministic in canonical space', () => {
  const x = 4316.7;
  const phase = 2.1;
  const frequency = surface.wind.frequency;
  const speed = surface.wind.speed;
  const jitter = MEADOW_WIND_DEFAULTS.phaseJitter;
  const time = 4.3;
  const atOrigin = meadowWindFrontNumber(x, phase, 0, frequency, speed, jitter);
  const downstream = meadowWindFrontNumber(x + time * speed / frequency, phase, time, frequency, speed, jitter);
  assert.ok(Math.abs(atOrigin - downstream) < 1e-11, 'crest must travel with prevailing wind');
  assert.equal(
    meadowWindFrontNumber(x, phase, 2, frequency, speed, jitter),
    meadowWindFrontNumber(x, phase, 2, frequency, speed, jitter),
  );
  assert.notEqual(
    meadowWindFrontNumber(x, phase, 2, frequency, speed, jitter),
    meadowWindFrontNumber(x, phase + 2, 2, frequency, speed, jitter),
    'individual blades keep small independent phase offsets',
  );
});

test('gust pressure strengthens crests but not troughs', () => {
  const boost = MEADOW_WIND_DEFAULTS.gustBoost;
  assert.equal(meadowGustPressureNumber(-1, 1, boost), 0);
  assert.equal(meadowGustPressureNumber(1, 0, boost), 1);
  assert.equal(meadowGustPressureNumber(1, 1, boost), 1 + boost);
  const pressure = meadowGustPressureNumber(0.3, 1, boost);
  assert.ok(pressure > meadowGustPressureNumber(0.3, 0, boost));
  assert.ok(pressure < 1 + boost);
});

test('flutter is tip-only and bounded by the existing grass culling envelope', () => {
  const start = surface.wind.flutter.heightStart;
  assert.equal(meadowFlutterHeightNumber(0, start), 0);
  assert.equal(meadowFlutterHeightNumber(start, start), 0);
  assert.equal(meadowFlutterHeightNumber(1, start), 1);
  assert.ok(meadowFlutterHeightNumber(0.8, start) > 0);
  for (const envelope of [0, 0.2, 1, 2.5, 3.5, 100]) {
    for (const gust of [0, 0.5, 1]) {
      const gain = meadowFlutterGainNumber(envelope, gust, MEADOW_WIND_DEFAULTS.flutterGust);
      assert.ok(gain >= 0 && gain <= MEADOW_FLUTTER_MAX_GAIN, 'no displacement outside page bounds');
    }
  }
  assert.equal(meadowFlutterGainNumber(0, 1, 1), 0);
});

test('flutter speed, frequency and height are read from configuration as live tuning', () => {
  const tuning = new GrassTuning(surface);
  assert.equal(tuning.uniforms.flutterSpeed.value, surface.wind.flutter.speed);
  assert.equal(tuning.uniforms.flutterFrequency.value, surface.wind.flutter.frequency);
  assert.equal(tuning.uniforms.flutterHeightStart.value, surface.wind.flutter.heightStart);
  tuning.setSettings({ flutterSpeed: 4.2, flutterFrequency: 2.2 });
  assert.equal(tuning.uniforms.flutterSpeed.value, 4.2);
  assert.equal(tuning.uniforms.flutterFrequency.value, 2.2);
});
