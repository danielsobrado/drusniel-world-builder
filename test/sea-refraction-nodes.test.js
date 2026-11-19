import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { float } from 'three/tsl';
import { SEA_SWELL_COMPONENTS } from '../src/editor/water/SeaSwell.js';
import { resolveSeaSurf } from '../src/editor/water/SeaSurf.js';
import { createSeaRefractionPhaseNode } from '../src/editor/stylized/SeaRefractionNodes.js';

const shader = await readFile(new URL('../src/editor/stylized/SeaSurfNodes.js', import.meta.url), 'utf8');

test('TSL builds the bounded refraction correction for each directional carrier', () => {
  const settings = resolveSeaSurf({ enabled: true, model: 'directionalBreakers',
    refraction: { enabled: true } });
  for (const [index, wave] of SEA_SWELL_COMPONENTS.slice(0, 3).entries()) {
    const phase = createSeaRefractionPhaseNode({
      waterDepth: float(1), shoreDistance: float(7), wave,
      referenceWaveNumber: settings.directional.waveNumbers[index],
      directional: settings.directional, settings: settings.refraction,
    });
    assert.equal(typeof phase.mul, 'function');
  }
  assert.match(shader, /createSeaRefractionPhaseNode\(/);
  assert.match(shader, /toVarying\(`seaRefractedSurfPhase\$\{index\}`\)/);
});

test('refraction requires no extra render pass, ocean texture, or world-space shader phase', async () => {
  const helper = await readFile(new URL('../src/editor/stylized/SeaRefractionNodes.js', import.meta.url), 'utf8');
  assert.doesNotMatch(helper, /viewport|cameraPosition|positionWorld|texture\(/);
  assert.match(helper, /shoreDistance\.max\(0\)/);
  assert.match(helper, /waterDepth\.max\(settings\.minimumDepthMeters\)/);
});
