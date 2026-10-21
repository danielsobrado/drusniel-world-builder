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
