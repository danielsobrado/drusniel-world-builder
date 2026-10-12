import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizePostProcessingSettings } from '../../src/render/postprocessing/PostProcessingSettings.js';
import { createPostProcessingTopologySignature } from '../../src/render/postprocessing/nodes/PostCommon.js';
import { POST_PROCESSING_PRESETS } from '../../src/render/postprocessing/PostProcessingPresets.js';

test('ambient occlusion is off by default and clamps its tuning', () => {
  assert.equal(normalizePostProcessingSettings({}).ambientOcclusion.enabled, false);
  const settings = normalizePostProcessingSettings({
    ambientOcclusion: { enabled: true, resolutionScale: 9, samples: 99, radius: -1, intensity: 3 },
  });
  assert.equal(settings.ambientOcclusion.enabled, true);
  assert.equal(settings.ambientOcclusion.resolutionScale, 1);
  assert.equal(settings.ambientOcclusion.samples, 16);
  assert.equal(settings.ambientOcclusion.radius, 0.05);
  assert.equal(settings.ambientOcclusion.intensity, 1);
});

test('toggling ambient occlusion or its resolution changes the graph topology; tuning does not', () => {
  const off = normalizePostProcessingSettings({});
  const on = normalizePostProcessingSettings({ ambientOcclusion: { enabled: true } });
  const tuned = normalizePostProcessingSettings({ ambientOcclusion: { enabled: true, intensity: 0.2, radius: 1 } });
  const scaled = normalizePostProcessingSettings({ ambientOcclusion: { enabled: true, resolutionScale: 1 } });
  assert.notEqual(createPostProcessingTopologySignature(off), createPostProcessingTopologySignature(on));
  assert.equal(createPostProcessingTopologySignature(on), createPostProcessingTopologySignature(tuned));
  assert.notEqual(createPostProcessingTopologySignature(on), createPostProcessingTopologySignature(scaled));
});

test('quality presets preserve the artistic ambient occlusion choice', () => {
  const current = normalizePostProcessingSettings({ ambientOcclusion: { enabled: true, intensity: 0.4 } });
  for (const id of ['low', 'balanced', 'high', 'ultra']) {
    const next = POST_PROCESSING_PRESETS[id].apply(current);
    assert.equal(next.ambientOcclusion.enabled, true, id);
    assert.equal(next.ambientOcclusion.intensity, 0.4, id);
  }
});
