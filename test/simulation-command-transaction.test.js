import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createCommandDispatcher,
  registerCommandHandler,
} from '../src/sim/commands/dispatcher.js';
import { createEmptyWorldState } from '../src/sim/model/worldState.js';

const COMMAND_TYPE = 'test.runtimeSideEffectsRollback';

const SCOPED_COMMAND_TYPE = 'test.scopedMutableRollback';

registerCommandHandler(SCOPED_COMMAND_TYPE, (state) => {
  state.settlements.get('settlement:test').data.value = 2;
  return [{
    type: 'entity.patched',
    payload: { value: Number.NaN },
  }];
}, { mutableKinds: ['settlement'] });


registerCommandHandler(COMMAND_TYPE, (_state, command) => {
  const { ledger, lod } = command.payload.__ctx;
  ledger.record({ kind: 'transient' });
  lod.value = 'mutated';
  return [{
    type: 'entity.patched',
    payload: { value: Number.NaN },
  }];
});

function createLedger() {
  const entries = [{ kind: 'existing' }];
  return {
    list: () => structuredClone(entries),
    clear: () => { entries.length = 0; },
    record: (entry) => { entries.push(structuredClone(entry)); },
  };
}

function createLod() {
  return {
    value: 'original',
    serialize() { return { value: this.value }; },
    restore(snapshot) { this.value = snapshot.value; },
  };
}

test('rejected commands roll back runtime side effects and invalid emitted events', () => {
  const state = createEmptyWorldState();
  const ledger = createLedger();
  const lod = createLod();
  const dispatcher = createCommandDispatcher();

  const result = dispatcher.dispatch(state, {
    id: 'command:rollback',
    type: COMMAND_TYPE,
    issuedAtTick: 1,
    expectedWorldRevision: null,
    payload: {},
  }, { ledger, lod });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'invalid_event_payload');
  assert.deepEqual(ledger.list(), [{ kind: 'existing' }]);
  assert.equal(lod.value, 'original');
  assert.equal(state.diagnostics.commandsRejected, 1);
  assert.equal(state.diagnostics.eventsEmitted, 0);
});


test('runtime rollback uses ledger checkpoints when available', () => {
  const entries = [{ kind: 'existing' }];
  let listCalls = 0;
  const ledger = {
    record(entry) { entries.push(structuredClone(entry)); },
    list() { listCalls += 1; return structuredClone(entries); },
    checkpoint() { return entries.length; },
    rollback(checkpoint) { entries.length = checkpoint; },
  };
  const state = createEmptyWorldState();
  const dispatcher = createCommandDispatcher();

  const result = dispatcher.dispatch(state, {
    id: 'command:checkpoint-rollback',
    type: COMMAND_TYPE,
    issuedAtTick: 1,
    expectedWorldRevision: null,
    payload: {},
  }, { ledger, lod: createLod() });

  assert.equal(result.ok, false);
  assert.deepEqual(entries, [{ kind: 'existing' }]);
  assert.equal(listCalls, 0);
});


test('scoped mutable handlers isolate their declared collections on rejection', () => {
  const state = createEmptyWorldState();
  state.settlements.set('settlement:test', {
    id: 'settlement:test',
    kind: 'settlement',
    revision: 0,
    createdAtTick: 0,
    updatedAtTick: 0,
    status: 'active',
    tags: [],
    data: { value: 1 },
  });
  const dispatcher = createCommandDispatcher();

  const result = dispatcher.dispatch(state, {
    id: 'command:scoped-rollback',
    type: SCOPED_COMMAND_TYPE,
    issuedAtTick: 1,
    expectedWorldRevision: null,
    payload: {},
  });

  assert.equal(result.ok, false);
  assert.equal(state.settlements.get('settlement:test').data.value, 1);
});
