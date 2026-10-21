import assert from 'node:assert/strict';
import test from 'node:test';

import { planDressing } from '../../src/editor/towns/TownDressing.js';
import { propClusterFor } from '../../src/editor/towns/TownPrefabCatalog.js';

// A row of well-spaced houses on an empty plan, so every candidate has room to land.
function dress(family) {
  const placed = Array.from({ length: 12 }, (_, index) => ({
    building: { kind: index % 4 === 0 ? 'smithy' : 'house', x: index * 24, z: 0, yaw: 0 },
    size: [8, 6],
    family,
  }));
  return planDressing({ plan: { streets: [], props: [], profile: {} }, seed: 99, placed, family });
}

const kinds = (props) => new Set(props.map((prop) => prop.kind));

test('frontier and mountain families dress houses with their own clutter, trees and rock', () => {
  const orc = kinds(dress('Orc'));
  assert.ok(orc.has('war_banner') && orc.has('drying_rack') && orc.has('tree'), [...orc].join());
  const frost = kinds(dress('Frostgard'));
  assert.ok(frost.has('pine') && frost.has('woodpile') && frost.has('boulders'), [...frost].join());
  const stone = kinds(dress('Stonehold'));
  assert.ok(stone.has('brazier_pillar') && stone.has('ore_crane'), [...stone].join());
  assert.ok(!stone.has('fence'), 'Stonehold yards are not fenced with planks');
  const tudor = kinds(dress('Tudor'));
  assert.ok(tudor.has('planter') && !tudor.has('war_banner'), [...tudor].join());
});

test('every regional dressing kind resolves to kit modules', () => {
  for (const kind of ['war_banner', 'fire_post', 'brazier_pillar', 'ore_crane', 'boulders', 'pine', 'tree']) {
    assert.ok(propClusterFor(kind, 0).length > 0, kind);
  }
});
