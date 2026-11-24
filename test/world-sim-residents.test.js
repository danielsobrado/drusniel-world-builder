import test from 'node:test';
import assert from 'node:assert/strict';
import { WorldSimRoster, WORLD_SIM_SCHEMA } from '../src/editor/actors/WorldSimRoster.js';
import { namedResidents, preferredSpots } from '../src/editor/actors/NamedResidents.js';
import { residentManifest } from '../src/editor/actors/ResidentManifest.js';
import { NpcSystem } from '../src/editor/actors/NpcSystem.js';
import { ResidentMemory, ResidentNameplate } from '../src/editor/actors/ResidentNameplate.js';
import { createSeededRandom } from '../src/editor/wildlife/math.js';

const header = { schema: WORLD_SIM_SCHEMA, version: 1, scenarioName: 'Pilot baseline', date: '1213-01-01', stateChecksum: 'sha256:abc' };
const person = (id, extra) => ({ id, name: `N${id}`, family: 'Vale', role: 'worker', profession: null, workplace: null, mood: 'settled',
  hooks: ['Worried about the roads'], introduction: { text: 'I am here. I work hard.' }, ...extra });
const DOC = { ...header, sourceId: 60, population: 9000, residents: [
  person('npc:60:1', { role: 'trader', profession: 'caravan master' }),
  person('npc:60:2', { profession: 'innkeeper', workplace: { name: 'Sshanderi Tavern', sector: 'services' } }),
  person('npc:60:3', { role: 'retired' }),
  person('npc:60:4', { role: 'child' }),
  person('npc:60:5', { profession: 'farmhand', workplace: { name: 'Sshanderi Farm 1', sector: 'agriculture' } }),
] };
const SPOTS = [{ x: 0, z: 0, kind: 'stall' }, { x: 10, z: 0, kind: 'square' }, { x: 20, z: 0, kind: 'bench' },
  { x: 30, z: 0, kind: 'tavern' }, { x: 40, z: 0, kind: 'street' }];
const SETTLEMENT = { id: 60, cellX: 10, cellZ: 10, population: 9000, capital: false };

test('the roster loads nothing until asked, then the index, then a settlement on approach', async () => {
  const asked = [];
  const files = { 'world-sim/index.json': { ...header, settlements: [{ sourceId: 60, file: 'settlements/60.json' }] },
    'world-sim/settlements/60.json': DOC };
  const roster = new WorldSimRoster({ baseUrl: '/', settings: { enabled: true, path: 'world-sim' },
    load: async url => { asked.push(url); return files[url.replace(/^\//, '')] ?? null; } });
  assert.deepEqual(asked, [], 'nothing at startup');
  assert.equal(roster.settlement(60), null);
  await new Promise(resolve => setTimeout(resolve));
  assert.equal(roster.settlement(60), null, 'the file starts loading once the index is in');
  assert.equal(roster.settlement(18), null, 'a town the export does not cover stays cosmetic');
  await new Promise(resolve => setTimeout(resolve));
  assert.equal(roster.settlement(60), DOC);
  assert.equal(asked.length, 2);
  roster.retain(new Set([18]));
  assert.equal(roster.files.has(60), false, 'out of range, out of memory');
});

test('an export of another schema or version is ignored', async () => {
  const roster = new WorldSimRoster({ baseUrl: '/', settings: { enabled: true, path: 'world-sim' },
    load: async () => ({ ...header, version: 99, settlements: [] }) });
  const warn = console.warn; console.warn = () => {};
  roster.settlement(60);
  await new Promise(resolve => setTimeout(resolve));
  console.warn = warn;
  assert.equal(roster.index, null);
});

test('named people keep their ids and stand where their life is', () => {
  const residents = namedResidents(SETTLEMENT, DOC, { count: 10, spots: SPOTS, settings: { wanderRadius: 18 }, centre: { x: 0, z: 0 } });
  assert.deepEqual(residents.map(r => r.id), ['npc:60:1', 'npc:60:2', 'npc:60:3', 'npc:60:5'], 'no children without a child model');
  const at = id => residents.find(r => r.id === id);
  assert.deepEqual([at('npc:60:1').x, at('npc:60:2').x, at('npc:60:3').x, at('npc:60:5').x], [0, 30, 20, 40]);
  assert.equal(at('npc:60:2').person.workplace, 'Sshanderi Tavern');
  assert.equal(at('npc:60:2').professionTitle, 'Innkeeper');
  assert.equal(at('npc:60:1').route.length, 2, 'they walk to another gathering place');
  assert.deepEqual(namedResidents(SETTLEMENT, DOC, { count: 10, spots: SPOTS, settings: { wanderRadius: 18 }, centre: { x: 0, z: 0 } }),
    residents, 'deterministic');
  assert.equal(namedResidents(SETTLEMENT, DOC, { count: 2, spots: SPOTS, settings: { wanderRadius: 18 }, centre: { x: 0, z: 0 } }).length, 2);
  assert.deepEqual(preferredSpots({ role: 'unemployed' }).slice(0, 2), ['square', 'bench']);
});

test('the manifest uses the named people when the export covers the town', () => {
  const settings = { maxPerSettlement: 14, wanderRadius: 18 };
  const named = residentManifest(SETTLEMENT, { tileSize: 2, worldSeed: 7, settings, spots: SPOTS, named: DOC });
  assert.ok(named.every(r => r.person && r.id.startsWith('npc:60:')));
  const cosmetic = residentManifest(SETTLEMENT, { tileSize: 2, worldSeed: 7, settings, spots: SPOTS });
  assert.ok(cosmetic.every(r => !r.person && r.id.startsWith('settlement:60:resident:')));
});

test('a named resident crosses to the next place on their route every third walk', () => {
  const system = Object.create(NpcSystem.prototype);
  Object.assign(system, { terrainView: { getCanonicalHeight: () => 0 }, canStand: () => true });
  const record = { x: 0, z: 0, wander: 4, route: [{ x: 0, z: 0 }, { x: 60, z: 0 }] };
  const entry = { record, x: 0, z: 0, random: createSeededRandom(3), leg: 0, walks: 0 };
  const targets = [0, 1, 2].map(() => system.pickTarget(entry));
  assert.ok(targets.slice(0, 2).every(t => Math.hypot(t.x, t.z) <= 4), 'first they potter about');
  assert.ok(Math.abs(targets[2].x - 60) <= 1 && entry.leg === 1, 'then walk the street to the square');
  entry.x = targets[2].x;
  assert.ok(Math.abs(system.pickTarget(entry).x - 60) <= 4, 'and potter about there');
  const walled = Object.assign(Object.create(NpcSystem.prototype), { terrainView: { getCanonicalHeight: () => 0 }, canStand: x => x < 30 });
  const blocked = { record, x: 0, z: 0, random: createSeededRandom(3), leg: 0, walks: 2 };
  assert.ok(walled.pickTarget(blocked).x < 30 && blocked.leg === 0, 'a building in the way keeps them where they are');
});

test('the player is remembered by the people they met', () => {
  const store = new Map();
  const storage = { getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) };
  const memory = new ResidentMemory(storage);
  assert.equal(memory.remember('npc:60:2', '2026-11-23T10:00:00Z'), null, 'a first meeting');
  assert.deepEqual(new ResidentMemory(storage).remember('npc:60:2', '2026-11-24T10:00:00Z'),
    { first: '2026-11-23T10:00:00Z', last: '2026-11-23T10:00:00Z', times: 1 }, 'remembered after a reload');
  const near = ResidentNameplate.prototype.nearest.call({ settings: { nameplateMeters: 4 } }, [
    { x: 3, z: 0, record: { person: {} } }, { x: 1, z: 1, record: {} }, { x: 9, z: 0, record: { person: {} } }], { x: 0, z: 0 });
  assert.equal(near.x, 3, 'only named people, only within reach');
});
