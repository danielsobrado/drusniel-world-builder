import assert from 'node:assert/strict';
import test from 'node:test';
import { LocationRuntime } from '../src/editor/locations/LocationRuntime.js';
import { resolveRenderEnhancements } from '../src/config/RenderEnhancements.js';

function fixture(t, early = true) {
  const calls = [];
  const previousDocument = globalThis.document, previousRaf = globalThis.requestAnimationFrame;
  globalThis.document = { body: { dataset: { location: 'cave' } } };
  globalThis.requestAnimationFrame = callback => { queueMicrotask(callback); return 1; };
  t.after(() => {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
    if (previousRaf === undefined) delete globalThis.requestAnimationFrame;
    else globalThis.requestAnimationFrame = previousRaf;
  });
  const renderer = { info: { memory: { total: 1024 } }, render() { calls.push('draw'); } };
  const leaving = { site: { id: 'cave', title: 'Cave' }, nav: {}, update() { calls.push('update'); },
    dispose() { calls.push('dispose'); renderer.info.memory.total = 256; } };
  const player = { groundOverride: leaving.nav, resetInput() {}, getGroundHeight: () => 12,
    placeAt() { calls.push('place'); } };
  const surfaceResidency = { enabled: true, settings: { surfaceEarlyLocationRetirementEnabled: early },
    evicted: new Map([['resource', {}]]), async restore() { calls.push('restore'); }, dispose() {} };
  const session = { start() {}, finish() {}, fail() {} };
  const runtime = new LocationRuntime({
    renderer, surfaceResidency, playerController: player, prompt: { show() {} },
    catalog: { returnTheme: { title: 'Surface' }, policy: { exitPhases: [] } },
    loading: { begin: () => session },
    viewModeController: { update() {}, camera: {}, setMode() { calls.push('mode'); } },
    cameraCutCoordinator: { async cut() { calls.push('cut'); } },
    floatingOrigin: { toRender: (x, z) => ({ x, z }) }, walkMode: 'walk',
  });
  runtime.current = leaving;
  runtime.anchor = { x: 2, z: 3, yaw: 0, pitch: 0, mode: 'walk' };
  runtime.record.active = { siteId: 'cave', anchor: runtime.anchor };
  runtime.state = 'inside';
  return { runtime, player, surfaceResidency, leaving, calls };
}

test('committed early return disposes before restore while holding both frame paths', async t => {
  const { runtime, player, surfaceResidency, calls } = fixture(t);
  surfaceResidency.restore = async () => {
    calls.push('restore');
    assert.equal(runtime.active, true);
    assert.equal(runtime.current, null);
    assert.equal(runtime.record.active, null);
    assert.equal(player.groundOverride, null);
    runtime.frame(0);
    assert.equal(player.cutBlocked, true);
  };
  assert.equal(await runtime.exit(), true);
  assert.deepEqual(calls, ['place', 'dispose', 'restore', 'cut']);
  assert.equal(runtime.active, false);
  assert.equal(runtime.state, 'idle');
});

test('legacy return retains the cave until restoration is finished', async t => {
  const { runtime, calls, surfaceResidency, leaving } = fixture(t, false);
  surfaceResidency.restore = async () => {
    calls.push('restore');
    assert.equal(runtime.current, leaving);
    runtime.frame(0);
  };
  assert.equal(await runtime.exit(), true);
  assert.deepEqual(calls, ['restore', 'update', 'draw', 'place', 'dispose', 'cut']);
});

test('no reclaimed resources preserves the legacy transition order', async t => {
  const { runtime, calls, surfaceResidency } = fixture(t);
  surfaceResidency.evicted.clear();
  assert.equal(await runtime.exit(), true);
  assert.deepEqual(calls, ['restore', 'place', 'dispose', 'cut']);
});

test('abort after early retirement cannot reactivate the disposed cave', async t => {
  const { runtime, calls, surfaceResidency, player } = fixture(t);
  surfaceResidency.restore = async signal => {
    calls.push('restore');
    runtime.preparation.abort();
    signal.throwIfAborted();
  };
  assert.equal(await runtime.exit(), false);
  assert.deepEqual(calls, ['place', 'dispose', 'restore']);
  assert.equal(runtime.current, null);
  assert.equal(runtime.active, false);
  assert.equal(runtime.state, 'idle');
  assert.equal(player.cutBlocked, false);
});

test('abort before commitment keeps the original cave', async t => {
  const { runtime, calls, leaving, player } = fixture(t);
  const exit = runtime.exit();
  runtime.preparation.abort();
  assert.equal(await exit, false);
  assert.deepEqual(calls, []);
  assert.equal(runtime.current, leaving);
  assert.equal(runtime.state, 'inside');
  assert.equal(player.groundOverride, leaving.nav);
});

test('early retirement is independently opt-in', () => {
  assert.equal(resolveRenderEnhancements().locationStructureBudget.surfaceEarlyLocationRetirementEnabled, false);
  assert.equal(resolveRenderEnhancements({}, '?locationSurfaceEarlyLocationRetirement=1').locationStructureBudget.surfaceEarlyLocationRetirementEnabled, true);
});
