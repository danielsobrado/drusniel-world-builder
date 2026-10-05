import assert from 'node:assert/strict';
import test from 'node:test';
import { Group, Matrix4, MeshBasicNodeMaterial, PerspectiveCamera, Scene, Vector2, Vector3, WebGPUCoordinateSystem } from 'three/webgpu';
import { float, uniform, vec2, vec3 } from 'three/tsl';
import { StartupTrace } from '../src/editor/performance/StartupTrace.js';
import { RendererCreationDiagnostics } from '../src/render/RendererCreationDiagnostics.js';
import { withReflectionCapture } from '../src/render/reflections/ReflectionCapture.js';
import { preparePlanarCamera } from '../src/render/reflections/PlanarCamera.js';
import { WaterReflectionController } from '../src/render/reflections/WaterReflectionController.js';
import { resolveRenderEnhancements } from '../src/config/RenderEnhancements.js';
import { createSnowReliefNodes } from '../src/editor/stylized/SnowReliefShading.js';

test('startup spans close failures/cancellation, are bounded, and disabled mode retains nothing', async () => {
  let time = 0;
  const trace = new StartupTrace({ enabled: true, capacity: 2, clock: () => time++ });
  await assert.rejects(trace.measure('failed', async () => { throw new Error('load'); }));
  trace.begin('cancelled'); trace.dispose();
  trace.measureSync('overflow', () => 1);
  assert.deepEqual(trace.getReport().spans.map(row => row.status), ['failed', 'cancelled']);
  assert.equal(trace.getReport().activeSpans, 0);
  assert.equal(trace.getReport().dropped, 1);
  const disabled = new StartupTrace();
  disabled.measureSync('ignored', () => 1); disabled.record('build', 'terrain', 10);
  assert.equal(disabled.getReport().spans.length, 0);
  assert.equal(disabled.getReport().creation.length, 0);
});

test('renderer hooks observe all preparation paths and restore previous callbacks', () => {
  const original = function () { return 4; }, previous = () => {};
  const renderer = { backend: { createProgram: original }, debug: { onNodeBuilderCreated: previous } };
  const trace = new StartupTrace({ enabled: true });
  const adapter = new RendererCreationDiagnostics(renderer, trace);
  assert.equal(renderer.backend.createProgram(), 4);
  const builder = { object: { name: 'terrain' }, fragmentShader: 'var s : sampler;', build() { return 3; } };
  renderer.debug.onNodeBuilderCreated(builder);
  assert.equal(builder.build(), 3);
  assert.equal(trace.getReport().creation.find(row => row.kind === 'nodeBuild').maxSamplers, 1);
  adapter.dispose(); adapter.dispose();
  assert.equal(renderer.backend.createProgram, original);
  assert.equal(renderer.debug.onNodeBuilderCreated, previous);
});

test('async shader diagnostics observe completion and ignore completion after disposal', async () => {
  const trace = new StartupTrace({ enabled: true });
  const renderer = { backend: {}, debug: { onNodeBuilderCreated: null } };
  const adapter = new RendererCreationDiagnostics(renderer, trace);
  const builder = { object: { name: 'water' }, build() {}, async buildAsync() { this.fragmentShader = 'shader'; return 7; } };
  renderer.debug.onNodeBuilderCreated(builder);
  assert.equal(await builder.buildAsync(), 7);
  assert.equal(trace.getReport().creation[0].kind, 'nodeBuildAsyncWall');
  let complete;
  const late = { build() {}, buildAsync: () => new Promise(resolve => { complete = resolve; }) };
  renderer.debug.onNodeBuilderCreated(late);
  const pending = late.buildAsync(); adapter.dispose(); complete(); await pending;
  assert.equal(trace.getReport().creation.length, 1);
});

test('reflection exceptions restore targets, MRT, visibility and shadow update policy', () => {
  let target = 'main', mrt = 'gbuffer';
  const renderer = { autoClear: false, getRenderTarget: () => target, setRenderTarget: v => { target = v; },
    getMRT: () => mrt, setMRT: v => { mrt = v; } };
  const scene = new Scene(), hidden = new Group(); scene.add(hidden);
  const light = new Group(); light.shadow = { autoUpdate: true, needsUpdate: true }; scene.add(light);
  assert.throws(() => withReflectionCapture(renderer, scene, [hidden], () => {
    assert.equal(hidden.visible, false); assert.equal(mrt, null);
    target = 'probe'; throw new Error('device');
  }));
  assert.equal(target, 'main'); assert.equal(mrt, 'gbuffer'); assert.equal(hidden.visible, true);
  assert.deepEqual(light.shadow, { autoUpdate: true, needsUpdate: true }); assert.equal(renderer.autoClear, false);
});

test('planar camera mirrors the pose and clips below a translated water plane', () => {
  const camera = new PerspectiveCamera(60, 1.5, 0.1, 200); camera.coordinateSystem = WebGPUCoordinateSystem;
  camera.position.set(5, 12, 8); camera.lookAt(0, 3, 0); camera.updateMatrixWorld();
  const mirror = preparePlanarCamera(camera, 3);
  assert.ok(Math.abs(mirror.position.y + 6) < 1e-8);
  assert.equal(mirror.near, camera.near);
  assert.notDeepEqual(mirror.projectionMatrix.elements, camera.projectionMatrix.elements);
  const above = new Vector3(0, 5, 0).applyMatrix4(mirror.matrixWorldInverse).applyMatrix4(mirror.projectionMatrix);
  const below = new Vector3(0, 2, 0).applyMatrix4(mirror.matrixWorldInverse).applyMatrix4(mirror.projectionMatrix);
  assert.ok(above.z >= 0 && below.z < 0, 'WebGPU near clip keeps only the scene above water');
});

test('local water resources are fixed-size and graph construction uses the installed TSL API', () => {
  const options = resolveRenderEnhancements({}, '?enhancements=high').waterReflections;
  const controller = new WaterReflectionController({}, options);
  assert.equal(controller.targets.length, 2);
  assert.ok(controller.sample(vec3(0, 1, 0), vec3(0.4)).isNode);
  controller.dispose(); assert.equal(controller.valid.value, 0);
  const relief = createSnowReliefNodes({ local: vec2(0), chunkCenter: uniform(new Vector2()), snow: float(1), pathMask: float(0) });
  assert.ok(relief.normal(vec3(0, 1, 0)).isNode);
  assert.equal(resolveRenderEnhancements({}, '?enhancements=high', { mobile: true }).shadowCascades, 1);
  assert.throws(() => resolveRenderEnhancements({ waterReflections: { resolution: 999 } }));
});

test('water captures publish complete probes, share reserved slack and reset cadence on rebase', () => {
  let origin = { x: 0, z: 0 }, target = null, mrt = null, draws = 0, yielding = false;
  const camera = new PerspectiveCamera(60, 1, 0.1, 200); camera.position.set(0, 8, 0); camera.updateMatrixWorld();
  const renderer = { coordinateSystem: WebGPUCoordinateSystem, autoClear: true,
    getRenderTarget: () => target, setRenderTarget: value => { target = value; }, getMRT: () => mrt, setMRT: value => { mrt = value; },
    render: () => { draws++; } };
  const view = { renderer, scene: new Scene(), floatingOrigin: { getState: () => origin }, worldStore: { generator: {} }, chunkWorldSize: 32,
    getCanonicalWater: () => ({ kind: 2, coverage: 1, surfaceHeight: 0 }) };
  const surface = { shouldYieldWork: () => yielding, waterSlots: [{ mesh: new Group(), hasWaterCoverage: true,
    terrainSlot: { descriptor: { centerWorldX: 0, centerWorldZ: 0 } } }] };
  const controller = new WaterReflectionController(view, { resolution: 128, reachMeters: 96, intervalMs: 100, planar: true });
  for (let i = 0; i < 5; i++) { controller.update(camera, surface, i); assert.equal(controller.valid.value, 0); }
  controller.update(camera, surface, 5); assert.equal(controller.valid.value, 1); assert.equal(draws, 6);
  yielding = true; controller.update(camera, surface, 106); assert.equal(draws, 6);
  controller.update(camera, surface, 106, { budgetReserved: true }); assert.equal(controller.planarValid.value, 1); assert.equal(draws, 7);
  origin = { x: 4096, z: 0 }; camera.position.x -= 4096;
  controller.update(camera, surface, 107); assert.equal(controller.valid.value, 0); assert.equal(controller.planarValid.value, 0);
  assert.equal(controller.lastPlanar, -Infinity);
  yielding = false; controller.prewarm(camera, surface); assert.equal(controller.planarValid.value, 1);
  controller.dispose(); controller.update(camera, surface, 9999); assert.equal(draws, 14);
});
