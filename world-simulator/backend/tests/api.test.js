import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createApp } from '../src/app.js';
import { eldaraModel } from './fixtures.js';

const server = createServer(createApp(eldaraModel()));
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
test.after(() => server.close());

async function get(path, init) {
  const res = await fetch(base + path, init);
  return { status: res.status, body: await res.json() };
}

test('every endpoint returns the versioned envelope with world identity', async () => {
  for (const path of ['/api/health', '/api/world', '/api/world/summary', '/api/world/settlements', '/api/world/connectivity', '/api/world/npc-budget', '/api/world/pilot']) {
    const { status, body } = await get(path);
    assert.equal(status, 200, path);
    assert.equal(body.apiVersion, 1);
    assert.equal(body.world.mapId, 'eldara-2026');
    assert.match(body.world.sourceFingerprint, /^sha256:/);
    assert.ok(body.data, path);
  }
});

test('summary and world expose real counts without filesystem paths', async () => {
  const { body } = await get('/api/world/summary');
  assert.equal(body.data.counts.settlements, 502);
  assert.equal(body.data.npcBudget.allocated, 10040);
  const world = await get('/api/world');
  assert.equal(world.body.data.markers.length, 502);
  assert.doesNotMatch(JSON.stringify(world.body), /[A-Za-z]:\\\\|\.\.\/maps/);
});

test('settlement list paginates, filters and sorts', async () => {
  const page = await get('/api/world/settlements?pageSize=100&page=6');
  assert.equal(page.body.meta.page.totalItems, 502);
  assert.equal(page.body.meta.page.totalPages, 6);
  assert.equal(page.body.data.length, 2);

  const capitals = await get('/api/world/settlements?capital=true&sort=population&order=desc');
  assert.equal(capitals.body.data.length, 8);
  const pops = capitals.body.data.map((s) => s.population);
  assert.deepEqual(pops, [...pops].sort((a, b) => b - a));

  const villages = await get('/api/world/settlements?class=named-village&maxPopulation=800&pageSize=200');
  assert.ok(villages.body.data.length > 0);
  assert.ok(villages.body.data.every((s) => s.class === 'named-village' && s.population <= 800));

  const search = await get('/api/world/settlements?q=vhal');
  assert.deepEqual(search.body.data.map((s) => s.name), ['Vhaltha']);
  const state = await get(`/api/world/settlements?state=${encodeURIComponent(search.body.data[0].stateId)}&pageSize=200`);
  assert.ok(state.body.data.every((s) => s.stateId === search.body.data[0].stateId));
});

test('invalid parameters return 400 with the offending parameter', async () => {
  for (const query of ['page=0', 'pageSize=1000', 'sort=secret', 'order=up', 'capital=yes', 'class=castle', 'minPopulation=10&maxPopulation=5', 'path=../x']) {
    const { status, body } = await get(`/api/world/settlements?${query}`);
    assert.equal(status, 400, query);
    assert.equal(body.error.code, 'invalid_parameter');
    assert.ok(body.error.details.parameter, query);
  }
});

test('settlement detail resolves stable and source ids; unknown ids are 404', async () => {
  const byStable = await get(`/api/world/settlements/${encodeURIComponent('settlement:azgaar-burg:238')}`);
  assert.equal(byStable.body.data.name, 'Vhaltha');
  assert.ok(byStable.body.data.connectivity.roadLinks.length > 0);
  assert.equal(byStable.body.data.pilot, true);
  const bySource = await get('/api/world/settlements/238');
  assert.equal(bySource.body.data.id, 'settlement:azgaar-burg:238');
  const missing = await get('/api/world/settlements/99999');
  assert.equal(missing.status, 404);
  assert.equal(missing.body.error.code, 'not_found');
});

test('the API is read-only and has no file endpoints', async () => {
  assert.equal((await get('/api/world', { method: 'POST' })).status, 405);
  assert.equal((await get('/api/files/..%2F..%2Fpackage.json')).status, 404);
  assert.equal((await get('/index.html')).status, 404, 'no static serving unless enabled');
});
