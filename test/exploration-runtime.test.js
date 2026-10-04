import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { FrameSlack } from '../src/editor/performance/FrameSlack.js';
import { resolveExplorationConfig } from '../src/editor/exploration/ExplorationConfig.js';
import { usesMobileProfile, applyMobileStartupProfile } from '../src/editor/exploration/MobileProfile.js';
import { CameraFollow } from '../src/editor/player/CameraFollow.js';
import { residentManifest, nearbySettlements } from '../src/editor/actors/ResidentManifest.js';
import { NpcSystem } from '../src/editor/actors/NpcSystem.js';
import { normalizeActorGeometry } from '../src/editor/actors/actorGeometry.js';
import { fitRootGround, resolveRootSettings, rootBendFor } from '../src/editor/stylized/forest/treeRootFit.js';
import { TreeRootFitter } from '../src/editor/stylized/forest/TreeRootFitter.js';
import { RendererRecovery } from '../src/editor/lifecycle/RendererRecovery.js';
import { withDrawPreparation, withPreparationFrame } from '../src/render/preparation/DrawPreparation.js';
import { LegacyWorkshopEditSession } from '../src/editor/workshop/interaction/LegacyWorkshopEditSession.js';
import { SerpentTrail } from '../src/editor/wildlife/SerpentTrail.js';
import { resolveSerpentSettings } from '../src/editor/wildlife/serpentSpecies.js';
import { GiantSerpent } from '../src/editor/wildlife/GiantSerpent.js';
import { SerpentSystem } from '../src/editor/wildlife/SerpentSystem.js';

const settings = resolveExplorationConfig();
test('shared preparation ceiling applies before nested work and permits no new work past its deadline', () => {
  let clock = 0;
  const budget = new FrameSlack({ maximumMs: 1.2, now: () => clock });
  budget.beginFrame();
  assert.equal(budget.available(0.25, 6), 1.2);
  budget.defer(() => {
    clock = 0.9;
    assert.ok(Math.abs(budget.available(0.25, 6) - 0.3) < 1e-10);
    budget.defer(() => { clock = 1.2; });
    assert.equal(budget.available(0.25, 6), 0);
  });
  assert.equal(budget.deferredMs, 1.2);
  assert.equal(budget.available(0.25, 6), 0);
});
test('frame slack excludes deferred time, reduces the allowance under load, and consumes a progress floor once', () => {
  let clock = 0;
  const budget = new FrameSlack({ targetMs: 10, reserveMs: 1, now: () => clock });
  budget.beginFrame(); clock = 7; budget.defer(() => { clock += 2; });
  assert.equal(budget.endFrame(), 7);
  budget.beginFrame(); assert.equal(budget.available(0.25, 6), 2);
  budget.defer(() => { clock += 10; }); assert.equal(budget.available(0.25, 6), 0);
});
test('deferred exceptions still book their cost', () => {
  let clock = 0; const budget = new FrameSlack({ now: () => clock }); budget.beginFrame();
  assert.throws(() => budget.defer(() => { clock = 2; throw Error('job'); })); assert.equal(budget.deferredMs, 2);
});
test('queues consume the same allowance while a deferred update is still running', () => {
  let clock = 0; const budget = new FrameSlack({ targetMs: 10, reserveMs: 1, now: () => clock });
  budget.beginFrame(); clock = 5; budget.endFrame(); budget.beginFrame();
  budget.defer(() => {
    assert.equal(budget.available(0.25, 6), 4);
    clock += 2; assert.equal(budget.available(0.25, 6), 2);
    budget.defer(() => { clock += 1; }); assert.equal(budget.available(0.25, 6), 1);
  });
  assert.equal(budget.deferredMs, 3);
});
test('exploration rejects invalid residency, biome IDs, and fractional limits', () => {
  for (const value of [{ serpents: { unloadRadius: 1 } }, { serpents: { tileIds: [255] } },
    { residents: { maxResidents: 1.5 } }, { frameBudget: { targetFps: NaN } }, { mobile: [] }]) {
    assert.throws(() => resolveExplorationConfig(value));
  }
});
test('mobile profile requires primary touch and a small viewport; narrow desktop retains its profile', () => {
  const runtime = { innerWidth: 390, innerHeight: 844, matchMedia: () => ({ matches: false }) };
  assert.equal(usesMobileProfile(settings.mobile, runtime), false);
  runtime.matchMedia = () => ({ matches: true }); assert.equal(usesMobileProfile(settings.mobile, runtime), true);
  const config = { exploration: settings, renderer: { maxPixelRatio: 2 }, stylizedSurface: { postProcessing: {} } };
  applyMobileStartupProfile(config, runtime); assert.equal(config.renderer.maxPixelRatio, 1);
  assert.equal(config.stylizedSurface.postProcessing.preset, 'low');
});
test('automatic camera follow preserves held movement basis while yaw catches up', () => {
  const follow = new CameraFollow();
  let result;
  for (let i = 0; i < 60; i++) result = follow.update({ yaw: result?.yaw ?? 0, x: 0.5, z: -1, dt: 1 / 60, touch: true });
  assert.notEqual(result.yaw, 0); assert.equal(result.movementYaw, 0);
  follow.manualLook(0.2); result = follow.update({ yaw: result.yaw, x: 0.5, z: -1, dt: 1 / 60, touch: true });
  assert.equal(result.movementYaw, 0.2);
});
test('resident identities and count project the existing population deterministically', () => {
  const burg = { id: 3, population: 1000, cellX: 5000000, cellZ: -4000000, capital: true };
  const options = { tileSize: 2, worldSeed: 8, settings: settings.residents };
  const manifest = residentManifest(burg, options);
  assert.deepEqual(manifest, residentManifest(burg, options)); assert.equal(manifest.length, 8);
  assert.equal(manifest[0].kind, 'paladin'); assert.equal(burg.population, 1000);
  assert.deepEqual(residentManifest(burg, { ...options, population: 0 }), []);
});
test('settlement query uses existing spatial buckets and removes duplicates', () => {
  const near = { settlement: { id: 1, cellX: 5, cellZ: 5 }, reachCells: 5 };
  const far = { settlement: { id: 2, cellX: 500, cellZ: 500 }, reachCells: 5 };
  const field = { tileSize: 2, bucketCells: 20, buckets: new Map([['0:0', [near, near, far]]]) };
  assert.deepEqual(nearbySettlements(field, { x: 10, z: -10 }, 10), [near.settlement]);
});
test('a pending resident survives a refreshed record and cannot resurrect after unload', async () => {
  let ready; const asset = new Promise(resolve => { ready = resolve; });
  const npcs = new NpcSystem({ scene: new THREE.Scene(), terrainView: {}, assets: { load: () => asset, dispose() {} } });
  const spawned = []; npcs.spawn = record => spawned.push(record);
  const first = { id: 'a', kind: 'villager' }, latest = { ...first, x: 2 };
  npcs.setManifest([first]); npcs.setManifest([latest]); ready({}); await asset; await Promise.resolve();
  assert.deepEqual(spawned, [latest]); npcs.dispose();
});
test('unloaded pending resident is dropped instead of reappearing', async () => {
  let ready; const asset = new Promise(resolve => { ready = resolve; });
  const npcs = new NpcSystem({ scene: new THREE.Scene(), terrainView: {}, assets: { load: () => asset, dispose() {} } });
  let spawns = 0; npcs.spawn = () => { spawns++; }; npcs.setManifest([{ id: 'a', kind: 'villager' }]);
  npcs.clear(); ready({}); await asset; await Promise.resolve(); assert.equal(spawns, 0); npcs.dispose();
});
test('actor normalization deinterleaves and decodes quantized attributes without losing skin indices', () => {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.InterleavedBufferAttribute(new THREE.InterleavedBuffer(new Uint16Array([0, 65535, 0, 9, 65535, 0, 65535, 8]), 4), 3, 0, true));
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute([0, 1, 2, 3, 1, 2, 3, 4], 4));
  normalizeActorGeometry(geometry); assert.ok(geometry.attributes.position.array instanceof Float32Array);
  assert.deepEqual([...geometry.attributes.position.array], [0, 1, 0, 1, 0, 1]);
  assert.ok(geometry.attributes.skinIndex.array instanceof Uint16Array); geometry.dispose();
});
test('tree root plane matches analytic sloping terrain and sinks below sampled ground', () => {
  const fitted = fitRootGround((x, z) => 10 + x * 0.2 - z * 0.3, 2000000, -3000000, 4, resolveRootSettings());
  assert.ok(Math.abs(fitted.slopeX - 0.2) < 1e-7); assert.ok(Math.abs(fitted.slopeZ + 0.3) < 1e-7);
  assert.ok(Math.abs(fitted.sink + 0.05) < 1e-7); assert.equal(fitted.overhang, 0);
});
test('root local bend accounts for rotated and scaled trees', () => {
  const tree = new THREE.Object3D(); tree.rotation.y = Math.PI / 2; tree.scale.set(2, 4, 3);
  const bend = rootBendFor(tree, 0.2, 0.3);
  assert.ok(Math.abs(bend.x + 0.15) < 1e-10); assert.ok(Math.abs(bend.y - 0.15) < 1e-10);
});
test('root fitter rejects a cliff overhang but preserves an explicitly planted tree', () => {
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 2, 0, 0], 3));
  const fitter = new TreeRootFitter({ parts: [[{ kind: 'trunk', geometry }]], resolvePrototypeIndex: () => 0,
    sampleHeight: (x, z) => Math.hypot(x, z) > 0 ? -20 : 0, settings: { maxSink: 2, maxOverhang: 1 } });
  const placement = { x: 0, z: 0, scale: 1, prototypeIndex: 0 };
  assert.equal(fitter.fit(placement), null); assert.ok(fitter.fit({ ...placement, planted: true }).rootFit); geometry.dispose();
});
test('draw preparation restores visibility, counts, ranges, and parenting even on failure', () => {
  const scene = new THREE.Scene(), existing = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  scene.add(existing); const parent = new THREE.Group(), target = existing.clone(); parent.add(target);
  target.visible = false; const range = { ...target.geometry.drawRange };
  assert.throws(() => withDrawPreparation(scene, [target], () => {
    assert.equal(existing.visible, false); assert.equal(target.visible, true); assert.equal(target.geometry.drawRange.count, 0); throw Error('render');
  }));
  assert.equal(target.parent, parent); assert.equal(target.visible, false); assert.equal(existing.visible, true);
  assert.deepEqual(target.geometry.drawRange, range); existing.geometry.dispose(); existing.material.dispose();
});
test('preparation advances scene-pass cache identity and restores temporal hooks', () => {
  const renderer = { isRenderer: true, _nodes: { nodeFrame: { frameId: 5 } } };
  const before = () => true, after = () => true, temporal = { updateBefore: before, updateAfter: after };
  withPreparationFrame(renderer, temporal, () => { assert.equal(renderer._nodes.nodeFrame.frameId, 6); assert.equal(temporal.updateBefore(), false); });
  assert.equal(renderer._nodes.nodeFrame.frameId, 7); assert.equal(temporal.updateBefore, before); assert.equal(temporal.updateAfter, after);
});
test('GPU recovery coalesces losses and caps restarts without backend fallback', async () => {
  let finish, captures = 0, releases = 0, failures = 0;
  const wait = new Promise(resolve => { finish = resolve; });
  const recovery = new RendererRecovery({ capture: () => { captures++; return { document: 1 }; }, release: () => { releases++; },
    restart: async (backend, state) => { assert.equal(backend, 'webgpu'); assert.equal(state.document, 1); await wait; }, onFailure: () => { failures++; } });
  const first = recovery.recover('webgpu', 'webgpu'); assert.equal(first, recovery.recover('webgpu', 'webgpu'));
  finish(); await first; await recovery.recover('webgpu', 'webgpu'); await recovery.recover('webgpu', 'webgpu');
  assert.equal(captures, 2); assert.equal(releases, 3); assert.equal(failures, 1); assert.equal(recovery.attempts, 2);
});
test('semantic workshop undo and redo remain usable after a renderer restart', () => {
  const session = new LegacyWorkshopEditSession(); const before = session.state;
  const after = { componentTransforms: { main: { position: [1, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } } };
  session.record(before, after); const state = session.captureRuntimeState(); session.dispose();
  const restarted = new LegacyWorkshopEditSession(); restarted.restoreRuntimeState(state);
  assert.equal(restarted.canUndo, true); assert.deepEqual(restarted.undo().componentTransforms, {});
  assert.equal(restarted.canRedo, true); assert.deepEqual(restarted.redo().componentTransforms, after.componentTransforms); restarted.dispose();
});
test('serpent trail follows the head and wraps with a bounded allocation', () => {
  const trail = new SerpentTrail(10, 0.05), capacity = trail.capacity;
  for (let i = 1; i < 1000; i++) trail.advance(i / 10, 0);
  const point = {}; trail.sample(2, point); assert.ok(Math.abs(point.x - 97.9) < 1e-4);
  assert.equal(trail.capacity, capacity); assert.equal(trail.x.length, capacity);
});
test('serpent species use world-scale lengths and explicit canonical anchors', () => {
  const snake = resolveSerpentSettings({ species: 'cobra', home: [2000000, -3000000] }, settings.serpents);
  assert.equal(snake.enabled, true); assert.equal(snake.shape.length, 15);
  assert.deepEqual(snake.home, [2000000, -3000000]); assert.equal(resolveSerpentSettings({}, settings.serpents).enabled, false);
});
test('serpent locomotion and skin geometry remain finite in a translated habitat', () => {
  const scene = new THREE.Scene(), texture = new THREE.DataTexture(new Uint8Array([128, 128, 128, 255]), 1, 1);
  const settings = resolveSerpentSettings({ home: [0, 0], seed: 7 });
  const serpent = new GiantSerpent({ scene, terrain: { sampleHeight: () => 2, habitatCost: () => 0 }, config: {}, settings, tileTexture: texture, patternTexture: texture });
  serpent.root.position.set(3000000, 0, -2000000); serpent.root.updateMatrixWorld(true);
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000); camera.position.set(3000000, 20, -2000010); camera.lookAt(serpent.root.position); camera.updateMatrixWorld();
  for (let i = 0; i < 10; i++) serpent.update(1 / 60, camera);
  assert.ok([...serpent.frames].every(Number.isFinite)); assert.equal(serpent.root.visible, true);
  serpent.dispose(); assert.equal(scene.children.length, 0); texture.dispose();
});
test('serpent habitats are deterministic and residency clears on leaving an anchor', () => {
  const terrainView = { worldStore: { generator: { seed: 1 }, tileSize: 2, getTile: () => 7 } };
  const system = new SerpentSystem({ scene: new THREE.Scene(), terrainView, settings: { ...settings.serpents, spawnChance: 1 } });
  assert.deepEqual(system.candidates({ x: 0, z: 0 }), system.candidates({ x: 0, z: 0 }));
  for (const entry of system.candidates({ x: 0, z: 0 })) assert.ok(Math.hypot(...entry.home) <= settings.serpents.loadRadius);
  let disposed = 0; system.entries.set('old', { home: [0, 0], serpent: { dispose: () => disposed++ }, skin: { release() {} } });
  system.settings.spawnChance = 0; system.refresh({ x: 10000, z: 10000 }); assert.equal(system.entries.size, 0); assert.equal(disposed, 1); system.dispose();
});

test('root placement controls do not invalidate geometry-only impostor bakes', async () => {
  const { createTreeImpostorSourceSignature } = await import('../src/editor/stylized/impostor/TreeImpostorManifest.js');
  const geometry = new THREE.BoxGeometry(); const prototypes = [[{ geometry, kind: 'trunk' }]];
  const base = { trees: { rootFit: { enabled: false }, perChunk: 10 } };
  const changed = { trees: { rootFit: { enabled: true, maxSink: 2 }, perChunk: 10 } };
  assert.equal(createTreeImpostorSourceSignature(prototypes, base), createTreeImpostorSourceSignature(prototypes, changed)); geometry.dispose();
});
test('scene preparation supplies neutral morph weights for empty instanced meshes', async () => {
  const { withSceneWarmup } = await import('../src/render/preparation/SceneWarmup.js');
  const geometry = new THREE.BoxGeometry(); geometry.morphAttributes.position = [geometry.attributes.position.clone()];
  const mesh = new THREE.InstancedMesh(geometry, new THREE.MeshBasicMaterial(), 4); mesh.count = 0;
  const scene = new THREE.Scene(); scene.add(mesh);
  withSceneWarmup(scene, () => { assert.deepEqual(mesh.morphTargetInfluences, [0]); assert.equal(mesh.count, 1); });
  assert.equal(mesh.count, 0); geometry.dispose(); mesh.material.dispose(); mesh.dispose();
});
test('startup scope releases each owned resource once and continues through a failing disposer', async () => {
  const { ResourceScope } = await import('../src/editor/lifecycle/ResourceScope.js');
  const scope = new ResourceScope(), order = []; const first = { dispose() { order.push('first'); } };
  scope.own(first); scope.own(first); scope.own({ dispose() { order.push('last'); } }); scope.dispose(); scope.dispose();
  assert.deepEqual(order, ['last', 'first']);
});
test('baked mip loader validates the complete payload and retains its levels without runtime generation', async () => {
  const { readFile } = await import('node:fs/promises');
  const { gzipSync, gunzipSync } = await import('node:zlib');
  const { loadFoliageMipTexture } = await import('../src/editor/stylized/impostor/FoliageMipTexture.js');
  const data = await readFile('public/assets/impostors/trees/prototype-0-albedo-mips.bin.gz');
  const fetch = async () => new Response(data);
  const texture = await loadFoliageMipTexture('test', fetch);
  assert.equal(texture.generateMipmaps, false); assert.equal(texture.mipmaps.at(-1).width, 1);
  assert.equal(texture.mipmaps.at(-1).height, 1); assert.equal(texture.flipY, false);
  const raw = gunzipSync(data), invalid = gzipSync(raw.subarray(0, raw.length - 4));
  await assert.rejects(loadFoliageMipTexture('test', async () => new Response(invalid)), /Truncated/);
  await assert.rejects(loadFoliageMipTexture('test', async () => new Response(null, { status: 404 })), /404/);
  texture.dispose();
});
test('all foliage artifacts retain level-zero source pixels and alpha coverage through practical mip levels', async () => {
  const { readFile } = await import('node:fs/promises');
  const { gunzipSync } = await import('node:zlib'); const { default: sharp } = await import('sharp');
  const manifest = JSON.parse(await readFile('public/assets/impostors/trees/manifest.json'));
  for (const prototype of manifest.prototypes) {
    const data = gunzipSync(await readFile('public' + prototype.albedoMips));
    const source = await sharp('public' + prototype.albedo).ensureAlpha().raw().toBuffer();
    const rowBytes = data.readUInt32LE(4) * 4, rows = data.readUInt32LE(8);
    for (let row = 0; row < rows; row++) {
      assert.deepEqual(data.subarray(16 + row * rowBytes, 16 + (row + 1) * rowBytes),
        source.subarray((rows - 1 - row) * rowBytes, (rows - row) * rowBytes));
    }
    let width = data.readUInt32LE(4), height = data.readUInt32LE(8), offset = 16, baseCoverage;
    for (let level = 0; level < data.readUInt32LE(12); level++) {
      const size = width * height * 4, pixels = data.subarray(offset, offset + size);
      let visible = 0; for (let i = 3; i < pixels.length; i += 4) if (pixels[i] >= 128) visible++;
      const coverage = visible / (width * height); baseCoverage ??= coverage;
      if (width * height >= 256) assert.ok(coverage >= baseCoverage, `prototype ${prototype.index}, mip ${level}`);
      offset += size; width = Math.max(1, width >> 1); height = Math.max(1, height >> 1);
    }
  }
});
