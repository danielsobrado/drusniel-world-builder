import test from 'node:test';
import assert from 'node:assert/strict';
import { observeLodRevisitResources } from '../scripts/lib/lod-revisit-resources.mjs';

test('revisit checkpoints separate slot reuse, resource accounting and renderer replacement', () => {
  const callbacks = [];
  const attribute = {};
  const slot = { key: '0:0', mesh: { visible: true, geometry: { attributes: { position: attribute } } } };
  const memoryMap = new Map([[attribute, 64]]);
  const renderer = { info: { memoryMap } };
  const terrainView = { slots: [slot], renderer, floatingOrigin: { getState: () => ({ x: 0, z: 0 }) } };
  const qa = { status: 'running', recording: true, config: { durationSeconds: 20 },
    live: { phase: 'first-visit', elapsedSeconds: 4 } };
  const saved = { window: globalThis.window, requestAnimationFrame: globalThis.requestAnimationFrame };
  globalThis.window = { __perfQa: qa, __editor: { terrainView,
    stylizedSurface: { treeView: { manifestStore: { cache: new Map() } } } } };
  globalThis.requestAnimationFrame = callback => callbacks.push(callback);
  try {
    observeLodRevisitResources();
    callbacks.shift()();
    slot.key = '4:0';
    qa.live.phase = 'cold-region';
    callbacks.shift()();
    const snapshots = window.__lodRevisitResources;
    assert.equal(snapshots[1].firstVisitTerrainKeysAbsent, 1);
    assert.equal(snapshots[1].firstVisitGpuResourcesUnaccounted, 0);
    terrainView.renderer = { info: { memoryMap: new Map() } };
    qa.live.phase = 'revisit-hold';
    callbacks.shift()();
    assert.equal(snapshots[2].sameRenderer, false);
    assert.equal(snapshots[2].firstVisitGpuResourcesUnaccounted, null);
  } finally {
    if (saved.window === undefined) delete globalThis.window; else globalThis.window = saved.window;
    if (saved.requestAnimationFrame === undefined) delete globalThis.requestAnimationFrame; else globalThis.requestAnimationFrame = saved.requestAnimationFrame;
  }
});
