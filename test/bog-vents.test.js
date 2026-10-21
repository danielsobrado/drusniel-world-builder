import assert from 'node:assert/strict';
import test from 'node:test';
import { BogVents } from '../src/editor/stylized/bog/BogVents.js';

function run({ isVentGround = () => true, seconds = 60, focus = { x: 0, z: 0 } } = {}) {
  const played = [];
  const vents = new BogVents({
    vfx: { play: (id, ctx) => { played.push({ id, ...ctx }); return true; } },
    isVentGround,
    origin: () => ({ x: 100, z: -50 }),
    seed: 3,
  });
  for (let t = 0; t < seconds; t += 0.1) vents.update(0.1, focus);
  return { played, vents };
}

test('vents burn in turns near the focus, in render space, never too many at once', () => {
  const { played, vents } = run();
  assert.ok(vents.vents.size > 0, 'some cells within reach hold a vent');
  assert.ok(played.length > vents.vents.size, 'vents relight after their pause');
  for (const flame of played) {
    assert.equal(flame.id, 'bogGasFlame');
    assert.ok(flame.duration >= 3.5 && flame.duration <= 7);
    // canonical = render + origin, and every vent lies within reach of the focus
    assert.ok(Math.hypot(flame.target.x + 100, flame.target.z - 50) <= 75);
  }
});

test('at most three vents burn at once', () => {
  const vents = new BogVents({ vfx: { play: () => true }, isVentGround: () => true, origin: () => ({ x: 0, z: 0 }), seed: 9,
    settings: { share: 1, pause: [0, 0.5] } });
  for (let t = 0; t < 30; t += 0.1) {
    vents.update(0.1, { x: 0, z: 0 });
    const burning = [...vents.vents.values()].filter((vent) => vent.burningUntil > vents.time).length;
    assert.ok(burning <= 3, `${burning} vents burning at ${t.toFixed(1)} s`);
  }
});

test('no vent stands on ground that is not dry bog', () => {
  const { played, vents } = run({ isVentGround: () => false });
  assert.equal(vents.vents.size, 0);
  assert.equal(played.length, 0);
});

test('vent sites are deterministic in their cell', () => {
  const first = run({ seconds: 2 }).vents;
  const second = run({ seconds: 2 }).vents;
  assert.deepEqual([...first.vents.keys()].sort(), [...second.vents.keys()].sort());
  for (const [key, vent] of first.vents) assert.equal(second.vents.get(key).x, vent.x);
});
