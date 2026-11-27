import assert from 'node:assert/strict';
import test from 'node:test';
import { RenderTarget, DataTexture, VSMShadowMap } from 'three/webgpu';
import { collectLocationAtmosphereTargets } from '../src/editor/locations/LocationAtmosphereResidency.js';
import { LocationSurfaceResidency } from '../src/editor/locations/LocationSurfaceResidency.js';
import { resolveRenderEnhancements } from '../src/config/RenderEnhancements.js';

function fixture(t) {
  const records = new Map(), memoryMap = new Map(), invalidations = [];
  const target = (size = 64) => {
    const rt = new RenderTarget(4, 4);
    records.set(rt, {});
    records.set(rt.texture, {});
    memoryMap.set(rt.texture, size);
    rt.addEventListener('dispose', () => { records.delete(rt); records.delete(rt.texture); });
    return rt;
  };
  const world = target(), history = target(), shaft = target(), cloud = target(), shadowTarget = target(), cave = target();
  const shaftNode = { renderTarget: shaft, initialized: true };
  const shadow = { map: shadowTarget, needsUpdate: false };
  const graph = { scenePass: { renderTarget: world } };
  const texture = new DataTexture(new Uint16Array(16), 4, 1);
  records.set(texture, {});
  memoryMap.set(texture, 32);
  texture.addEventListener('dispose', () => records.delete(texture));
  const post = { resources: { graphs: new Map([['active', { graph }]]) },
    history: { taaColourTargets: [history, null], taaDepthTargets: [], ssrColourTargets: [], ssrDepthTargets: [] },
    invalidation: { invalidate(reason) { invalidations.push(reason); } } };
  const surface = { terrainView: { slots: [], scene: { environment: texture }, postProcessing: post,
    godRays: { cloudPass: { renderTarget: cloud }, cinematicShafts: { mask: shaftNode } } },
    waterSlots: [], skyView: { directional: { castShadow: true, shadow }, environment: { surfaceTexture: texture } } };
  const renderer = { backend: { isWebGPUBackend: true }, _textures: records, info: { memoryMap },
    getRenderTarget: () => cave, initTexture: () => assert.fail('deferred targets must not warm during exit') };
  const settings = { ...resolveRenderEnhancements().locationStructureBudget, surfacePostReclamationEnabled: true,
    surfaceAtmosphereReclamationEnabled: true, surfaceShadowReclamationEnabled: true, surfaceEnvironmentReclamationEnabled: true,
    surfaceIdleMs: 10, surfaceSampleMs: 10, surfaceEvictionsPerSample: 16, surfaceMaxEvictedBytes: 32768 };
  const controller = new LocationSurfaceResidency(surface, renderer, settings, async () => {});
  t.after(() => { controller.dispose(); for (const rt of [world, history, shaft, cloud, shadowTarget, cave]) rt.dispose(); texture.dispose(); });
  return { controller, surface, renderer, settings, records, memoryMap, world, history, shaft, cloud, shadowTarget, cave,
    texture, shaftNode, shadow, invalidations };
}

test('world target reclamation retains graph identities and invalidates reuse before exit', async t => {
  const { controller, records, world, history, shaft, cloud, shadowTarget, cave, texture, shaftNode, shadow, invalidations } = fixture(t);
  controller.begin({ x: 0, z: 0 }, 0);
  controller.update(10);
  assert.equal(controller.evicted.size, 6);
  for (const resource of [world, history, shaft, cloud, shadowTarget, texture]) assert.equal(records.has(resource), false);
  assert.equal(records.has(cave), true);
  assert.equal(shaftNode.initialized, false);
  assert.equal(shadow.needsUpdate, true);
  assert.ok(invalidations.every(reason => reason === 'RENDER_PATH_CHANGED'));
  assert.equal(invalidations.length, 2);
  await controller.restore();
  assert.equal(controller.evicted.size, 0);
});

test('shared target deduplicates and unknown accounting, current target and VSM are protected', t => {
  const { surface, renderer, settings, world, cloud, shadowTarget, cave, memoryMap } = fixture(t);
  surface.terrainView.godRays.scenePass = { renderTarget: world };
  surface.terrainView.godRays.raysTexture = { renderTarget: cave };
  renderer.shadowMap = { type: VSMShadowMap };
  memoryMap.delete(cloud.texture);
  const entries = collectLocationAtmosphereTargets(surface, renderer, settings);
  assert.equal(entries.filter(e => e.resource === world).length, 1);
  for (const target of [cloud, shadowTarget, cave]) assert.ok(!entries.some(e => e.resource === target));
});

test('outdoor resource options remain opt-in', () => {
  for (const name of ['Post', 'Atmosphere', 'Shadow', 'Environment']) {
    const key = 'surface' + name + 'ReclamationEnabled';
    assert.equal(resolveRenderEnhancements().locationStructureBudget[key], false);
    assert.equal(resolveRenderEnhancements({}, '?locationSurface' + name + 'Reclamation=1').locationStructureBudget[key], true);
  }
});
