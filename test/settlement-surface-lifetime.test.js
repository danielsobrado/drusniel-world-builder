import assert from 'node:assert/strict';
import test from 'node:test';
import { Texture } from 'three/webgpu';
import { SettlementSurfaceLibrary } from '../src/editor/world/settlements/surfaces/SettlementSurfaceLibrary.js';
import { SETTLEMENT_ROLE_FALLBACK } from '../src/editor/world/settlements/surfaces/SettlementDressing.js';

const dressing = { ...SETTLEMENT_ROLE_FALLBACK, cobble: 'cobble-cut' };
function fixture() {
  const library = new SettlementSurfaceLibrary();
  let fail, disposed = 0, photographed = 0;
  library.generateProcedural = () => new Promise((_, reject) => { fail = reject; });
  library.loadPhotographed = async name => { photographed++; return { name, dispose() { disposed++; } }; };
  return { library, fail: () => fail(new Error('injected load failure')),
    counts: () => ({ disposed, photographed }) };
}

test('release before a failed recipe cannot acquire an orphaned fallback', async () => {
  const f = fixture(), lease = f.library.acquire(dressing);
  const rejected = assert.rejects(lease.surfaces, /injected/);
  lease.release(); lease.release(); f.fail(); await rejected;
  assert.equal(f.library.sets.size, 0);
  assert.deepEqual(f.counts(), { disposed: 7, photographed: 7 });
});

test('one released owner cannot cancel a live owner or its fallback', async t => {
  const f = fixture(), first = f.library.acquire(dressing), second = f.library.acquire(dressing);
  const rejected = assert.rejects(first.surfaces, /injected/);
  first.release(); f.fail(); await rejected;
  const surfaces = await second.surfaces;
  assert.equal(surfaces.cobble.name, 'cobble-grey');
  assert.equal(f.library.sets.get('cobble-grey').uses, 1);
  second.release(); second.release(); await Promise.resolve();
  assert.equal(f.library.sets.size, 0);
  assert.equal(f.counts().disposed, 8);
  t.after(() => f.library.dispose());
});

test('disposing a library prevents late fallbacks and further acquisition', async () => {
  const f = fixture(), lease = f.library.acquire(dressing);
  const rejected = assert.rejects(lease.surfaces, /injected/);
  f.library.dispose(); f.fail(); await rejected; lease.release();
  assert.equal(f.library.sets.size, 0);
  assert.throws(() => f.library.acquireSet('cobble-grey'), /disposed/);
});

test('partially loaded photographed sets release every successful texture on failure', async () => {
  let disposed = 0;
  const library = new SettlementSurfaceLibrary({ loader: { loadAsync: async file => {
    if (file.includes('-normal')) throw new Error('missing normal');
    const texture = new Texture(); texture.addEventListener('dispose', () => disposed++); return texture;
  } } });
  await assert.rejects(library.loadPhotographed('cobble-grey', {}), /missing normal/);
  assert.equal(disposed, 2);
  library.dispose();
});

test('successful completion after release disposes its set without reviving the lease', async () => {
  const library = new SettlementSurfaceLibrary();
  let finish, disposed = 0;
  library.generateProcedural = () => new Promise(resolve => { finish = resolve; });
  library.loadPhotographed = async name => ({ name, dispose() { disposed++; } });
  const lease = library.acquire(dressing);
  lease.release();
  finish({ name: 'cobble-cut', dispose() { disposed++; } });
  await lease.surfaces; await Promise.resolve();
  assert.equal(library.sets.size, 0); assert.equal(disposed, 8);
  library.dispose();
});

test('a failed fallback releases the other roles and both failed references', async t => {
  const f = fixture(), load = f.library.loadPhotographed;
  f.library.loadPhotographed = name => name === 'cobble-grey' ? Promise.reject(new Error('fallback failed')) : load(name);
  const warn = console.warn; console.warn = () => {};
  t.after(() => { console.warn = warn; f.library.dispose(); });
  const lease = f.library.acquire(dressing);
  const rejected = assert.rejects(lease.surfaces, /fallback failed/);
  f.fail(); await rejected; await Promise.resolve();
  lease.release(); assert.equal(f.library.sets.size, 0);
  assert.deepEqual(f.counts(), { disposed: 7, photographed: 7 });
});

test('disposal during a recipe fetch cannot start another bake', async t => {
  const originalFetch = globalThis.fetch;
  let deliver, bakes = 0, disposed = 0;
  globalThis.fetch = () => new Promise(resolve => { deliver = resolve; });
  t.after(() => { globalThis.fetch = originalFetch; });
  const library = new SettlementSurfaceLibrary();
  library.baker = { bake() { bakes++; assert.fail('bake after disposal'); }, dispose() { disposed++; } };
  const loading = library.generateProcedural('cobble-cut', {});
  library.dispose(); deliver({ ok: true, json: async () => ({}) });
  await assert.rejects(loading, /disposed/);
  assert.equal(bakes, 0); assert.equal(disposed, 1);
  assert.equal(library.baker, null); assert.equal(library.sets.size, 0);
});
