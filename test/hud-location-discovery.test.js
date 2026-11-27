import assert from 'node:assert/strict';
import test from 'node:test';
import { LocationDiscoveryTracker, classifyBurg } from '../src/editor/player/hud/LocationDiscoveryTracker.js';

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => map.set(key, value),
  };
}

test('classifyBurg categorizes capitals, ports, cities, towns, and frontier settlements', () => {
  assert.equal(classifyBurg({ capital: true, population: 12 }), 'Royal capital');
  assert.equal(classifyBurg({ port: 1, population: 2 }), 'Harbour settlement');
  assert.equal(classifyBurg({ population: 9 }), 'Walled city');
  assert.equal(classifyBurg({ population: 3 }), 'Market town');
  assert.equal(classifyBurg({ population: 0.8 }), 'Frontier settlement');
});

test('LocationDiscoveryTracker announces first discovery and enforces revisit cooldown', () => {
  const storage = memoryStorage();
  const events = [];
  let nearest = { settlement: { id: 7, name: 'Highfield', population: 0.9 }, radius: 70, distance: 35 };

  const tracker = new LocationDiscoveryTracker({
    getFocusCanonical: () => ({ x: 100, z: -100 }),
    getNearestSettlement: () => nearest,
    describeRegion: () => 'The Northern Reach',
    tileSize: 1,
    onNotify: (payload) => events.push(payload),
    storage,
  });

  tracker.update(1000);
  assert.equal(events.length, 1);
  assert.equal(events[0].kind, 'location-discovered');
  assert.equal(events[0].eyebrow, 'NEW LOCATION DISCOVERED');
  assert.equal(events[0].title, 'Highfield');
  assert.equal(events[0].region, 'The Northern Reach');
  assert.equal(events[0].subtitle, 'Frontier settlement');

  // Leaving and immediately re-entering within cooldown should not spam banners.
  nearest = null;
  tracker.update(2000);
  nearest = { settlement: { id: 7, name: 'Highfield', population: 0.9 }, radius: 70, distance: 35 };
  tracker.update(3000);
  assert.equal(events.length, 1);

  // After revisit cooldown, entering fires a quieter location-entered notice.
  nearest = null;
  tracker.update(4000);
  nearest = { settlement: { id: 7, name: 'Highfield', population: 0.9 }, radius: 70, distance: 35 };
  tracker.update(100000);
  assert.equal(events.length, 2);
  assert.equal(events[1].kind, 'location-entered');
  assert.equal(events[1].title, 'Highfield');
});

test('wilderness region notifications require dwell time to avoid border flicker', () => {
  const storage = memoryStorage();
  const events = [];
  const tracker = new LocationDiscoveryTracker({
    getFocusCanonical: () => ({ x: 20, z: -20 }),
    getNearestSettlement: () => null,
    describeRegion: () => 'Stonehold',
    onNotify: (payload) => events.push(payload),
    storage,
  });

  tracker.update(1000);
  assert.equal(events.length, 0);
  tracker.update(5000);
  assert.equal(events.length, 0);
  tracker.update(9500);
  assert.equal(events.length, 1);
  assert.equal(events[0].title, 'Stonehold');
});
