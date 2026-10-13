import assert from 'node:assert/strict';
import test from 'node:test';
import { buildOpportunityVisibilityViewModel } from '../src/sim/presentation/viewModels.js';

test('opportunity visibility counts hidden records without repeatedly scanning visible IDs', () => {
  let idReads = 0;
  const opportunities = Array.from({ length: 1000 }, (_, index) => ({
    get id() { idReads++; return `quest:${String(index).padStart(4, '0')}`; },
    data: { type: 'quest', visibility: ['public', 'discovered', 'private', 'discovered'][index % 4],
      discoveredBy: index % 4 === 1 ? ['player'] : ['another-actor'] },
  }));
  const queries = { list(kind, options) {
    assert.equal(kind, 'opportunity');
    assert.deepEqual(options, { includeDestroyed: false });
    return opportunities;
  } };
  const result = buildOpportunityVisibilityViewModel(queries);
  assert.equal(result.hiddenCount, 500);
  assert.equal(result.visible.length, 500);
  assert.deepEqual(result.visible.slice(0, 3).map(item => item.id), ['quest:0000', 'quest:0001', 'quest:0004']);
  assert.ok(Object.isFrozen(result.visible[0]));
  assert.ok(idReads <= opportunities.length, `visibility read ${idReads} IDs for 1000 records`);
  assert.equal(buildOpportunityVisibilityViewModel(queries, 'another-actor').hiddenCount, 500);
  assert.deepEqual(buildOpportunityVisibilityViewModel({ list: () => [] }), {
    kind: 'opportunityVisibility', visible: [], hiddenCount: 0,
  });
});
