import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three/webgpu';
import { texture, uniform } from 'three/tsl';
import { resolveRenderEnhancements } from '../../src/config/RenderEnhancements.js';
import { BloomNode } from '../../src/render/postprocessing/nodes/BloomNode.js';
import { AmbientOcclusionNode } from '../../src/render/postprocessing/nodes/AmbientOcclusionNode.js';
import { ScreenSpaceShaftNode } from '../../src/render/postprocessing/nodes/ScreenSpaceShaftNode.js';
import { GodsEndLightShafts } from '../../src/editor/stylized/GodsEndLightShafts.js';

const atmosphere = resolveRenderEnhancements().atmosphericPassBudget;

test('adaptive bloom preserves target topology, exposure and original filter on recovery', () => {
  const image = new THREE.Texture();
  const settings = { levels: 4, threshold: 1.05, knee: 0.45, bloomBoost: 0.85 };
  const bloom = new BloomNode({ sourceNode: texture(image), materialNode: texture(image), settings, adaptiveAtmosphere: true });
  try {
    const targets = [...bloom.targets, ...bloom.upsampleTargets];
    bloom.resize(1280, 720);
    bloom.updateUniforms(settings, 1.15, atmosphere);
    assert.equal(bloom.reducedFilter.value, 1);
    assert.equal(bloom.exposure.value, 1.15);
    assert.deepEqual([...bloom.targets, ...bloom.upsampleTargets], targets);
    bloom.updateUniforms(settings, 1.15);
    assert.equal(bloom.reducedFilter.value, 0);
  } finally { bloom.dispose(); image.dispose(); }
});

test('AO trace resolution adapts without changing GTAO samples or contact intensity', () => {
  const image = new THREE.Texture();
  const camera = new THREE.PerspectiveCamera();
  const settings = { resolutionScale: 0.5, samples: 8, radius: 0.85, thickness: 0.85, intensity: 0.34 };
  const node = new AmbientOcclusionNode({ sourceNode: texture(image), depthNode: texture(image), normalNode: texture(image), camera, settings });
  try {
    node.updateUniforms({ camera }, settings, atmosphere);
    assert.equal(node.resolutionScale, 0.375);
    assert.equal(node.aoPass.samples.value, 8);
    assert.equal(node.intensity.value, 0.34);
    node.updateUniforms({ camera }, settings);
    assert.equal(node.resolutionScale, 0.5);
  } finally { node.dispose(); image.dispose(); }
});

test('both shaft graphs retain targets and restore full sample counts', () => {
  const image = new THREE.Texture();
  const depth = texture(image);
  const camera = new THREE.PerspectiveCamera();
  camera.updateMatrixWorld();
  const settings = { samples: 32, resolutionScale: 0.5, intensity: 1, reach: 0.82, decay: 0.955 };
  const screen = new ScreenSpaceShaftNode({ sourceNode: depth, depthNode: depth, settings, adaptiveSamples: true });
  const cinematic = new GodsEndLightShafts({ depth, sunUv: uniform(new THREE.Vector2()), intensity: uniform(1), adaptiveSamples: true });
  try {
    const target = screen.radianceNode;
    screen.updateUniforms({ camera }, settings, atmosphere);
    assert.equal(screen.activeSamples.value, 16);
    screen.updateUniforms({ camera }, settings);
    assert.equal(screen.activeSamples.value, 32);
    assert.equal(screen.radianceNode, target);
    cinematic.setActiveSamples(16);
    assert.equal(cinematic.activeSamples.value, 16);
    assert.ok(Math.abs(cinematic.normalization.value * Array.from({ length: 16 }, (_, i) => cinematic.decay.value ** i).reduce((a, b) => a + b, 0) - 1) < 1e-9);
    cinematic.setActiveSamples(32);
    assert.equal(cinematic.activeSamples.value, 32);
  } finally { screen.dispose(); cinematic.dispose(); image.dispose(); }
});
