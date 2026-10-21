import assert from 'node:assert/strict';
import test from 'node:test';

import { TownCollisionSource } from '../../src/editor/collision/providers/TownCollisionSource.js';

const box = (id, x) => ({ id, x, y: 1, z: 0, sx: 1, sy: 2, sz: 1, yaw: 0 });

function run(job, between) {
  let steps = 0;
  for (let step = job.next(); !step.done; step = job.next()) if (++steps === 3) between();
  return steps;
}

test('a city registering its boxes is not restarted by a change elsewhere in the world', () => {
  const source = new TownCollisionSource().configure(64);
  source.setOwner('town:far', [box('far', 5000)]);
  const city = Array.from({ length: 2000 }, (_, i) => box(`c${i}`, (i % 40) * 3));
  const steps = run(source.setOwnerJob('town:city', city), () => source.setBoxEnabled('town:far', box('far', 5000), false));
  const quiet = run(new TownCollisionSource().configure(64).setOwnerJob('town:city', city), () => {});
  assert.equal(steps, quiet, 'an unrelated chunk change did not restart the job');
  assert.equal(source.getBoxCount(), 2000);
});

test('a change to a chunk the city is filling restarts it, so nothing is lost', () => {
  const source = new TownCollisionSource().configure(64);
  source.setOwner('town:near', [box('door', 10)]);
  const city = Array.from({ length: 500 }, (_, i) => box(`c${i}`, (i % 20) * 3));
  run(source.setOwnerJob('town:city', city), () => source.setBoxEnabled('town:near', box('door', 10), false));
  assert.equal(source.getBoxCount(), 500, 'the city landed and the opened door stays open');
});
