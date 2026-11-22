import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import yaml from 'js-yaml';

import { resolveLocationCatalog } from '../src/editor/locations/LocationCatalog.js';
import { generateLocation } from '../src/editor/locations/LocationBuilder.js';
import { LOCATION_GENERATORS } from '../src/editor/locations/generators/index.js';

function loadCatalog() {
  const doc = yaml.load(fs.readFileSync('config/instanced-locations.yaml', 'utf8'));
  return resolveLocationCatalog(doc, { generatorKeys: Object.keys(LOCATION_GENERATORS) });
}

test('Stonehold showcase locations resolve and interlink cleanly (gate <-> hall <-> throne)', () => {
  const catalog = loadCatalog();
  const gate = catalog.site('showcase-stonehold-gate');
  const hall = catalog.site('showcase-stonehold-hall');
  const throne = catalog.site('showcase-stonehold-throne');

  assert.equal(gate.generatorKey, 'stonehold-gate-approach');
  assert.equal(throne.generatorKey, 'stonehold-throne-hall');
  assert.equal(gate.links.hold?.site, 'showcase-stonehold-hall');
  assert.equal(hall.links.gate?.site, 'showcase-stonehold-gate');
  assert.equal(hall.links.throne?.site, 'showcase-stonehold-throne');
  assert.equal(throne.links.hall?.site, 'showcase-stonehold-hall');
  assert.equal(gate.materials.waterfall?.kind, 'waterfall');
  assert.ok(gate.lighting.sky?.peaks, 'gate approach should configure alpine sky peaks');
});

test('StoneholdGateApproachGenerator builds continuous walkable causeway from approach to portal', () => {
  const catalog = loadCatalog();
  const site = catalog.site('showcase-stonehold-gate');
  const builder = generateLocation(site, LOCATION_GENERATORS[site.generatorKey]);

  assert.ok(builder.spawns.entry, 'entry spawn must exist');
  assert.ok(builder.exits.some((e) => e.id === 'hold'), 'hold portal exit must exist');
  assert.ok(builder.props.has('waterfall'), 'waterfalls must be emitted');
  assert.ok(builder.flames.length >= 20, 'flaming braziers and forge hearth must be present');

  // Verify continuous walkable ground along approach -> viaduct -> grand staircase -> threshold plaza.
  const stations = [
    { x: 0, z: 48, minY: 4, maxY: 6.5 },
    { x: 0, z: 24, minY: 6.8, maxY: 8.2 },
    { x: 0, z: 10, minY: 7.8, maxY: 9.2 },
    { x: 0, z: -10, minY: 11.0, maxY: 13.0 },
    { x: 0, z: -23, minY: 14.0, maxY: 15.2 },
  ];
  for (const s of stations) {
    const h = builder.nav.surfaceAt(s.x, s.z, s.maxY + 1);
    assert.ok(Number.isFinite(h), `expected walkable ground at z=${s.z}`);
    assert.ok(h >= s.minY && h <= s.maxY, `height ${h} out of range [${s.minY}, ${s.maxY}] at z=${s.z}`);
  }
});

test('StoneholdThroneGenerator builds walkable dais, gold hoard, banners, and reflective floor', () => {
  const catalog = loadCatalog();
  const site = catalog.site('showcase-stonehold-throne');
  const builder = generateLocation(site, LOCATION_GENERATORS[site.generatorKey]);

  assert.ok(builder.spawns.entry, 'entry spawn must exist');
  assert.ok(builder.exits.some((e) => e.id === 'hall'), 'hall return exit must exist');
  assert.equal(builder.reflectors.length, 1, 'throne hall should register its polished reflective floor');
  assert.ok(builder.props.has('gold'), 'royal treasury gold hoards must be emitted');
  assert.ok(builder.props.has('cloth'), 'crimson heraldic banners must be emitted');

  const naveY = builder.nav.surfaceAt(0, 2, 1);
  const daisY = builder.nav.surfaceAt(0, -18, 3);
  assert.ok(Math.abs(naveY) < 0.05, `expected nave floor near 0, got ${naveY}`);
  assert.ok(Math.abs(daisY - 2.4) < 0.1, `expected dais floor near 2.4, got ${daisY}`);
});
