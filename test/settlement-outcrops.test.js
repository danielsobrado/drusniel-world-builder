import assert from 'node:assert/strict';
import test from 'node:test';

import { planSettlement } from '../src/editor/world/settlements/SettlementPlanner.js';

const hills = (x, z) => 30 + Math.sin(x * 0.11) * 3 + Math.cos(z * 0.09) * 3;

function plan(cfg, sampleHeight = hills) {
  return planSettlement({
    settlement: { id: 910, name: 'Outcrop Test', cellX: 80, cellZ: 80, population: 18, plaza: true, ...cfg },
    worldSeed: 4242,
    sampleHeight,
  });
}

const outcrops = (p) => p.props.filter((prop) => prop.kind === 'outcrop');

test('frontier and mountain towns break their slopes with rock outcrops', () => {
  for (const cfg of [
    { culture: 7, stateName: 'Frostgard', biomeId: 11, elevation: 26 },
    { culture: 10, stateName: 'Ironpeak', biomeId: 10, elevation: 48 },
  ]) {
    const rocks = outcrops(plan(cfg));
    assert.ok(rocks.length >= 3, `${cfg.stateName} should get outcrops, got ${rocks.length}`);
    for (const rock of rocks) assert.ok(rock.scale > 2, 'an outcrop is a big rock');
  }
});

test('lowland towns get no outcrops, and outcrop plans are deterministic', () => {
  assert.equal(outcrops(plan({ culture: 3, stateName: 'Lumeshire', biomeId: 6, elevation: 12 })).length, 0);
  const frost = plan({ culture: 7, stateName: 'Frostgard', biomeId: 11, elevation: 26 });
  const again = plan({ culture: 7, stateName: 'Frostgard', biomeId: 11, elevation: 26 });
  assert.deepEqual(frost.buildings.map((b) => [b.kind, b.x, b.z]), again.buildings.map((b) => [b.kind, b.x, b.z]));
});
