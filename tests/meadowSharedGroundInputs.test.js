import assert from 'node:assert/strict';
import test from 'node:test';
import {
  identityOf,
  MeadowSharedGroundInputs,
  resolveGroundSnapshot,
  splitGroundSnapshot,
} from '../src/editor/stylized/meadow/MeadowSharedGroundInputs.js';

function snapshot(page, key = 'k1') {
  return { page, chunkSize: 16, tileSize: 2, eligible: new Uint8Array(256), shapeTable: new Uint8Array(256),
    growth: null, worldSeed: 7, pathConfig: {}, forest: null,
    descriptor: { key: 'd' }, rocks: [{ x: 1, z: 2, radius: 1, reach: 2 }], flatten: 0.5, sharedKey: key };
}
const page = () => ({ tiles: new Uint8Array(256), heights: new Float32Array(289), surfaceMaskPixels: new Uint8Array(1024) });

test('a worker receives shared ground once and rebuilds the identical flat snapshot', () => {
  const mirror = new MeadowSharedGroundInputs(), cache = new Map();
  const first = snapshot(page());
  const a = structuredClone({ type: 'build', ...mirror.request(first).fields });
  assert.ok(a.shared, 'the first request carries the page');
  const b = mirror.request({ ...first, rocks: [], descriptor: { key: 'd2' } });
  assert.equal(b.fields.shared, undefined, 'a second tile on the page sends only its own fields');
  assert.ok(b.bytes < 64, 'a repeat request clones no page arrays');
  const resolved = resolveGroundSnapshot(cache, a);
  const { sharedKey, ...expected } = first;
  assert.deepEqual(resolved, expected);
  const second = resolveGroundSnapshot(cache, structuredClone(b.fields));
  assert.deepEqual(second.page, expected.page);
  assert.deepEqual(second.rocks, []);
});

test('eviction is mirrored in message order and bounded by entries and bytes', () => {
  const mirror = new MeadowSharedGroundInputs({ maxEntries: 2, maxBytes: 1e9 }), cache = new Map();
  const send = key => resolveGroundSnapshot(cache, structuredClone(mirror.request(snapshot(page(), key)).fields));
  send('a'); send('b'); send('a'); send('c');
  assert.deepEqual([...cache.keys()].sort(), ['a', 'c'], 'the least recently used page leaves first');
  assert.deepEqual([...mirror.entries.keys()].sort(), ['a', 'c']);
  // An evicted page is resent rather than referenced.
  assert.ok(mirror.request(snapshot(page(), 'b')).fields.shared);
  const bytes = new MeadowSharedGroundInputs({ maxEntries: 99, maxBytes: 3000 });
  bytes.request(snapshot(page(), 'x')); bytes.request(snapshot(page(), 'y'));
  assert.equal(bytes.entries.size, 1);
  assert.ok(bytes.bytes <= 3000);
});

test('a worker missing a referenced page fails loudly instead of sampling stale ground', () => {
  const mirror = new MeadowSharedGroundInputs();
  mirror.request(snapshot(page(), 'a'));
  const reference = mirror.request(snapshot(page(), 'a')).fields;
  assert.throws(() => resolveGroundSnapshot(new Map(), reference), /missing shared ground/);
});

test('identity keys change with replaced objects and split keeps per-tile fields local', () => {
  const settings = {};
  assert.equal(identityOf(settings), identityOf(settings));
  assert.notEqual(identityOf(settings), identityOf({}));
  assert.equal(identityOf(null), '-');
  const { shared, local } = splitGroundSnapshot(snapshot(page()));
  assert.deepEqual(Object.keys(local).sort(), ['descriptor', 'flatten', 'rocks']);
  assert.ok(shared.page && shared.eligible && 'forest' in shared);
});
