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

test('shadow warmup allocates only retired shadow targets on separate frames and keeps them dirty', async t => {
  const { controller, surface, renderer, records, memoryMap, settings, shadowTarget, shadow, world, cave } = fixture(t);
  settings.surfaceShadowWarmupEnabled = true;
  renderer.info.memory = { total: 1024 };
  const other = new RenderTarget(4, 4);
  const cascade = { map: other, needsUpdate: false };
  records.set(other, {});
  records.set(other.texture, {});
  memoryMap.set(other.texture, 64);
  other.addEventListener('dispose', () => { records.delete(other); records.delete(other.texture); });
  t.after(() => other.dispose());
  surface.skyView.cascades = { node: { lights: [{ castShadow: true, shadow: cascade }] } };
  const warmed = [];
  let frames = 0;
  controller.pause = async () => { frames++; };
  renderer.initRenderTarget = target => {
    warmed.push([target, frames]);
    records.set(target, {});
  };
  controller.begin({ x: 0, z: 0 }, 0);
  controller.update(10);
  await controller.restore();
  assert.deepEqual(warmed, [[shadowTarget, 1], [other, 2]]);
  assert.equal(shadow.needsUpdate, true);
  assert.equal(cascade.needsUpdate, true);
  assert.equal(records.has(world), false);
  assert.equal(records.has(cave), true);
});

test('shadow warmup skips replaced, resized, over-budget and headroom-constrained targets', async t => {
  for (const mode of ['replaced', 'resized', 'budget', 'pressure', 'missing', 'vsm']) {
    const { controller, renderer, settings, shadow, shadowTarget } = fixture(t);
    settings.surfaceShadowWarmupEnabled = true;
    renderer.info.memory = { total: 1024 };
    renderer.initRenderTarget = () => assert.fail(mode);
    controller.begin({ x: 0, z: 0 }, 0);
    controller.update(10);
    if (mode === 'replaced') shadow.map = null;
    if (mode === 'resized') shadowTarget.setSize(8, 8);
    if (mode === 'budget') settings.surfaceShadowWarmupMaxTargetBytes = 1;
    if (mode === 'pressure') renderer.info.memory.total = 4096 * 1024 * 1024;
    if (mode === 'missing') delete renderer.info.memory;
    if (mode === 'vsm') renderer.shadowMap = { type: VSMShadowMap };
    let attempts = 0;
    renderer.initRenderTarget = () => { attempts++; };
    await controller.restore();
    assert.equal(attempts, 0, mode);
  }
});

test('shadow warmup cancellation prevents allocation after a frame yield', async t => {
  const { controller, renderer, settings } = fixture(t);
  settings.surfaceShadowWarmupEnabled = true;
  renderer.info.memory = { total: 1024 };
  const abort = new AbortController();
  controller.pause = async () => abort.abort();
  let attempts = 0;
  renderer.initRenderTarget = () => { attempts++; };
  controller.begin({ x: 0, z: 0 }, 0);
  controller.update(10);
  await assert.rejects(controller.restore(abort.signal), { name: 'AbortError' });
  assert.equal(attempts, 0);
});

test('shadow warmup is independently opt-in', () => {
  assert.equal(resolveRenderEnhancements().locationStructureBudget.surfaceShadowWarmupEnabled, false);
  assert.equal(resolveRenderEnhancements({}, '?locationSurfaceShadowWarmup=1').locationStructureBudget.surfaceShadowWarmupEnabled, true);
  assert.throws(() => resolveRenderEnhancements({ locationStructureBudget: { surfaceShadowWarmupMaxBytes: 1.5 } }), RangeError);
});

function activatePost(surface) {
  const post = surface.terrainView.postProcessing;
  post.topologySignature = 'active';
  post.resources.activeSignature = 'active';
  post.graph = post.resources.graphs.get('active').graph;
  post.graph.taaResolve = {};
  return post;
}

test('post and shadow allocations share the transition budget and never warm inactive graphs', async t => {
  const { controller, surface, renderer, settings, records, memoryMap, shadowTarget, world, history, cave } = fixture(t);
  settings.surfaceShadowWarmupEnabled = true;
  settings.surfacePostWarmupEnabled = true;
  settings.surfaceTargetWarmupMaxBytes = 128;
  renderer.info.memory = { total: 1024 };
  const post = activatePost(surface);
  const inactive = new RenderTarget(4, 4);
  records.set(inactive, {});
  records.set(inactive.texture, {});
  memoryMap.set(inactive.texture, 64);
  inactive.addEventListener('dispose', () => { records.delete(inactive); records.delete(inactive.texture); });
  t.after(() => inactive.dispose());
  post.resources.graphs.set('inactive', { graph: { scenePass: { renderTarget: inactive } } });
  let frames = 0;
  const warmed = [];
  controller.pause = async () => { frames++; };
  renderer.initRenderTarget = target => { warmed.push([target, frames]); records.set(target, {}); };
  controller.begin({ x: 0, z: 0 }, 0);
  controller.update(10);
  await controller.restore();
  assert.deepEqual(warmed, [[shadowTarget, 1], [world, 2]]);
  assert.equal(records.has(history), false);
  assert.equal(records.has(inactive), false);
  assert.equal(records.has(cave), true);
});

test('post warmup allocates selected history without validating temporal contents', async t => {
  const { controller, surface, renderer, settings, records, world, history, invalidations } = fixture(t);
  settings.surfacePostWarmupEnabled = true;
  renderer.info.memory = { total: 1024 };
  activatePost(surface);
  const warmed = [];
  renderer.initRenderTarget = target => { warmed.push(target); records.set(target, {}); };
  controller.begin({ x: 0, z: 0 }, 0);
  controller.update(10);
  const before = invalidations.length;
  await controller.restore();
  assert.deepEqual(warmed, [world, history]);
  assert.equal(invalidations.length, before + 2);
  assert.ok(invalidations.every(reason => reason === 'RENDER_PATH_CHANGED'));
});

test('post warmup rechecks topology and target dimensions after yielding', async t => {
  for (const mode of ['topology', 'resize', 'bypass', 'disabled-history']) {
    const { controller, surface, renderer, settings, records, world, history } = fixture(t);
    settings.surfacePostWarmupEnabled = true;
    renderer.info.memory = { total: 1024 };
    const post = activatePost(surface);
    const warmed = [];
    renderer.initRenderTarget = target => { warmed.push(target); records.set(target, {}); };
    controller.begin({ x: 0, z: 0 }, 0);
    controller.update(10);
    if (mode === 'disabled-history') post.graph.taaResolve = null;
    controller.pause = async () => {
      if (mode === 'topology') post.topologySignature = 'new';
      if (mode === 'resize') { world.setSize(8, 8); history.setSize(8, 8); }
      if (mode === 'bypass') post.isBypassed = () => true;
    };
    await controller.restore();
    assert.deepEqual(warmed, mode === 'disabled-history' ? [world] : [], mode);
  }
});

test('post warmup and shared target budget are independently configurable', () => {
  assert.equal(resolveRenderEnhancements().locationStructureBudget.surfacePostWarmupEnabled, false);
  assert.equal(resolveRenderEnhancements({}, '?locationSurfacePostWarmup=1').locationStructureBudget.surfacePostWarmupEnabled, true);
  assert.throws(() => resolveRenderEnhancements({ locationStructureBudget: { surfaceTargetWarmupMaxBytes: 1.5 } }), RangeError);
});

function activateAtmosphere(surface, technique) {
  const rays = surface.terrainView.godRays;
  Object.assign(rays, { enabled: true, technique, config: { resolutionScale: 0.5, volumetric: { resolutionScale: 0.5 } },
    screenPipeline: {}, cinematicPipeline: {}, volumetricPipeline: {} });
  return rays;
}

test('cinematic warmup shares shadow budget, leaves clouds and post cold, invalidates both shaft passes', async t => {
  const { controller, surface, renderer, settings, records, shadowTarget, shaft, cloud, world, shaftNode } = fixture(t);
  const rays = activateAtmosphere(surface, 'cinematic');
  activatePost(surface);
  rays.cinematicShafts.march = { initialized: true };
  settings.surfaceAtmosphereWarmupEnabled = true;
  settings.surfacePostWarmupEnabled = true;
  settings.surfaceShadowWarmupEnabled = true;
  settings.surfaceTargetWarmupMaxBytes = 128;
  renderer.info.memory = { total: 1024 };
  let frames = 0;
  const warmed = [];
  controller.pause = async () => { frames++; };
  renderer.initRenderTarget = target => { warmed.push([target, frames]); records.set(target, {}); };
  controller.begin({ x: 0, z: 0 }, 0);
  controller.update(10);
  shaftNode.initialized = true;
  rays.cinematicShafts.march.initialized = true;
  await controller.restore();
  assert.deepEqual(warmed, [[shadowTarget, 1], [shaft, 2]]);
  assert.equal(shaftNode.initialized, false);
  assert.equal(rays.cinematicShafts.march.initialized, false);
  assert.equal(records.has(cloud), false);
  assert.equal(records.has(world), false);
});

test('volumetric and screen-space warmup select only their owned targets', async t => {
  for (const technique of ['volumetric', 'screen-space']) {
    const { controller, surface, renderer, settings, records, cloud, shaft } = fixture(t);
    const rays = activateAtmosphere(surface, technique);
    rays.volumetricRays = { _godraysRenderTarget: shaft };
    rays.raysTexture = { renderTarget: shaft };
    // Use the same allocation as a retired inactive cinematic target to exercise deduplication.
    settings.surfaceAtmosphereWarmupEnabled = true;
    renderer.info.memory = { total: 1024 };
    const warmed = [];
    renderer.initRenderTarget = target => { warmed.push(target); records.set(target, {}); };
    controller.begin({ x: 0, z: 0 }, 0);
    controller.update(10);
    await controller.restore();
    assert.deepEqual(warmed, [cloud, shaft], technique);
  }
});

test('atmospheric warmup skips disabled effects, post precedence and changed settings after yield', async t => {
  for (const mode of ['disabled', 'post', 'technique', 'scale', 'canvas', 'disposed', 'budget']) {
    const { controller, surface, renderer, settings, records } = fixture(t);
    const rays = activateAtmosphere(surface, mode === 'post' ? 'screen-space' : 'cinematic');
    renderer.domElement = { width: 800, height: 600 };
    renderer.info.memory = { total: 1024 };
    settings.surfaceAtmosphereWarmupEnabled = true;
    const warmed = [];
    renderer.initRenderTarget = target => { warmed.push(target); records.set(target, {}); };
    controller.begin({ x: 0, z: 0 }, 0);
    controller.update(10);
    if (mode === 'disabled') rays.enabled = false;
    if (mode === 'post') surface.terrainView.postProcessing.settings = { enabled: true };
    if (mode === 'budget') settings.surfaceAtmosphereWarmupMaxTargetBytes = 1;
    controller.pause = async () => {
      if (mode === 'technique') rays.technique = 'screen-space';
      if (mode === 'scale') rays.config.resolutionScale = 0.25;
      if (mode === 'canvas') renderer.domElement.width = 1024;
      if (mode === 'disposed') rays.disposed = true;
    };
    await controller.restore();
    assert.deepEqual(warmed, [], mode);
  }
});

test('atmosphere target warmup is independently opt-in and validates byte ceilings', () => {
  assert.equal(resolveRenderEnhancements().locationStructureBudget.surfaceAtmosphereWarmupEnabled, false);
  assert.equal(resolveRenderEnhancements({}, '?locationSurfaceAtmosphereWarmup=1').locationStructureBudget.surfaceAtmosphereWarmupEnabled, true);
  assert.throws(() => resolveRenderEnhancements({ locationStructureBudget: { surfaceAtmosphereWarmupMaxBytes: 1.5 } }), RangeError);
});
