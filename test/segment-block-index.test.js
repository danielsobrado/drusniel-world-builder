import assert from 'node:assert/strict';
import test from 'node:test';
import { SegmentBlockIndex } from '../src/editor/water/SegmentBlockIndex.js';

function random(seed) {
  let state = seed >>> 0;
  return () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296);
}

function segmentFrom(next) {
  const ax = (next() - 0.5) * 200000;
  const az = (next() - 0.5) * 200000;
  const dx = (next() - 0.5) * 60000;
  const dz = (next() - 0.5) * 60000;
  return { ax, az, dx, dz, length: Math.hypot(dx, dz), margin: 20 + next() * 400 };
}

function distance(x, z, s) {
  const t = Math.max(0, Math.min(1, ((x - s.ax) * s.dx + (z - s.az) * s.dz) / (s.length * s.length)));
  return Math.hypot(x - (s.ax + s.dx * t), z - (s.az + s.dz * t));
}

test('every segment within its margin of a cell is a candidate there, in insertion order', () => {
  const next = random(11);
  const index = new SegmentBlockIndex({ blockSize: 64, coarseBlocks: 32, cacheLimit: 64 });
  const segments = Array.from({ length: 60 }, () => segmentFrom(next));
  for (const segment of segments) index.add(segment, segment.margin);
  let checked = 0;
  for (const segment of segments) {
    for (let k = 0; k < 40; k += 1) {
      // Points near the segment, so the test exercises reaches, not empty space.
      const t = next();
      const x = segment.ax + segment.dx * t + (next() - 0.5) * 2 * segment.margin;
      const z = segment.az + segment.dz * t + (next() - 0.5) * 2 * segment.margin;
      const candidates = index.at(x, z);
      for (const other of segments) {
        if (distance(x, z, other) <= other.margin) {
          assert.ok(candidates.includes(other), 'a segment within reach is missing');
          checked += 1;
        }
      }
      const order = candidates.map((candidate) => segments.indexOf(candidate));
      assert.deepEqual(order, [...order].sort((a, b) => a - b));
    }
  }
  assert.ok(checked > 1000);
  assert.ok(index.fine.size <= 64, 'the fine cache stays bounded');
});

test('far from every segment a block has no candidates', () => {
  const index = new SegmentBlockIndex({ blockSize: 64 });
  index.add({ ax: 0, az: 0, dx: 1000, dz: 0, length: 1000 }, 30);
  assert.deepEqual(index.at(500, 5000), []);
  assert.equal(index.at(500, 10).length, 1);
});
