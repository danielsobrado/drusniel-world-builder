import assert from 'node:assert/strict';
import test from 'node:test';
import { SettlementMeshWorkerClient } from '../src/editor/world/settlements/view/SettlementMeshWorkerClient.js';

function fakeWorker() {
  const listeners = new Map();
  return {
    posted: [],
    terminated: false,
    addEventListener(type, listener) { listeners.set(type, listener); },
    postMessage(message) { this.posted.push(message); },
    terminate() { this.terminated = true; },
    emit(type, event) { listeners.get(type)(event); },
  };
}

test('a request resolves with the data the worker answers for its id', async () => {
  const worker = fakeWorker();
  const client = new SettlementMeshWorkerClient({ workerFactory: () => worker });
  const first = client.build({ key: 'granite-slate' }, 'house', 0);
  const second = client.build({ key: 'granite-slate' }, 'tower', 0);
  assert.equal(client.inFlight, 2);
  assert.deepEqual(worker.posted.map(({ kind }) => kind), ['house', 'tower']);
  // Answers may come back in any order.
  worker.emit('message', { data: { id: worker.posted[1].id, data: { archetype: 'tower' } } });
  worker.emit('message', { data: { id: worker.posted[0].id, data: { archetype: 'house' } } });
  assert.deepEqual(await first, { archetype: 'house' });
  assert.deepEqual(await second, { archetype: 'tower' });
  assert.equal(client.inFlight, 0);
});

test('a variant the generator refuses rejects only its own request', async () => {
  const worker = fakeWorker();
  const client = new SettlementMeshWorkerClient({ workerFactory: () => worker });
  const request = client.build({}, 'planter', 0);
  worker.emit('message', { data: { id: worker.posted[0].id, error: 'Width must be between 2 and 16.' } });
  await assert.rejects(request, /Width must be between/);
  assert.equal(client.available, true);
});

test('a dead worker fails what it owed and stops being offered', async () => {
  const worker = fakeWorker();
  const client = new SettlementMeshWorkerClient({ workerFactory: () => worker });
  const request = client.build({}, 'house', 1);
  const warn = console.warn;
  console.warn = () => {};
  try {
    worker.emit('error', { message: 'Script error.' });
  } finally {
    console.warn = warn;
  }
  await assert.rejects(request, /Script error/);
  assert.equal(client.available, false);
  assert.equal(worker.terminated, true);
  await assert.rejects(client.build({}, 'house', 1), /unavailable/);
});

test('without workers the client is simply unavailable', () => {
  const client = new SettlementMeshWorkerClient();
  assert.equal(client.available, typeof Worker !== 'undefined');
  client.dispose();
});
