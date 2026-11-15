import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import yaml from 'js-yaml';
import * as THREE from 'three/webgpu';
import { LOCATION_GENERATORS } from '../src/editor/locations/generators/index.js';
import { generateLocation } from '../src/editor/locations/LocationBuilder.js';
import { resolveLocationCatalog } from '../src/editor/locations/LocationCatalog.js';
import { extrudedProfile } from '../src/editor/locations/gen/propKit.js';
import { clipFieldToDressings } from '../src/editor/locations/gen/masonryDressingClip.js';

const source = yaml.load(fs.readFileSync(new URL('../config/instanced-locations.yaml', import.meta.url), 'utf8'));
const catalog = resolveLocationCatalog(source, { generatorKeys: Object.keys(LOCATION_GENERATORS), quality: 'low' });

test('a bevelled profile stays inside its outline, so abutting stones do not share faces', () => {
  const geometry = extrudedProfile([[0, 0], [1, 0], [1, 0.5], [0, 0.5]], 0.3, { bevel: 0.04 });
  geometry.computeBoundingBox();
  const { min, max } = geometry.boundingBox;
  for (const [value, expected] of [[min.x, 0], [max.x, 1], [min.y, 0], [max.y, 0.5]]) assert.ok(Math.abs(value - expected) < 1e-6, `${value} ≈ ${expected}`);
});

test('field stones stop where an arch dressing begins', () => {
  const square = (half) => [[-half, -half], [half, -half], [half, half], [-half, half]];
  const field = { category: 'field', s: 0, y: 0, corners: square(0.5) };
  const clear = { category: 'field', s: 5, y: 0, corners: square(0.5) };
  const voussoir = { category: 'voussoir', s: 0.5, y: 0, contourPolygons: [[square(0.25)]] };
  const cut = clipFieldToDressings([field, clear, voussoir]);
  assert.ok(!cut.has(clear), 'a stone no dressing reaches is left alone');
  const [[ring]] = cut.get(field);
  assert.ok(ring.every(([x, y]) => !(x > 0.25 + 1e-9 && Math.abs(y) < 0.25 - 1e-9)), 'nothing remains inside the voussoir');
});

test('the catalog rejects a reference to something that does not exist', () => {
  const broken = structuredClone(source);
  broken.instancedLocations.archetypes.working_mine.lightingProfile = 'nope';
  assert.throws(() => resolveLocationCatalog(broken, { generatorKeys: Object.keys(LOCATION_GENERATORS) }), /lighting profile "nope"/);
});

for (const site of catalog.showcaseSites()) {
  test(`${site.id} generates a walkable, lit place with a way out`, () => {
    const generator = LOCATION_GENERATORS[site.generatorKey];
    const builder = generateLocation(site, generator);
    const material = new THREE.MeshBasicMaterial();
    const materials = Object.fromEntries(Object.keys(site.materials).map((key) => [key, { material, ice: 0 }]));
    const group = builder.build({ materials, absorption: site.lighting.absorption });

    const spawn = builder.spawns.entry;
    const ground = builder.nav.surfaceAt(spawn.x, spawn.z, spawn.y + 0.3);
    assert.ok(ground !== null && Math.abs(ground - spawn.y) < 1.5, 'the entry spawn stands on walkable ground');
    assert.ok(builder.grid.sample(spawn.x, ground + 1.2, spawn.z) > 0, 'the entry spawn is in open air');
    for (const exit of builder.exits) {
      assert.ok(builder.nav.surfaceAt(exit.x, exit.z, exit.y + 0.6) !== null, `exit ${exit.id} can be walked to`);
    }

    let vertices = 0, lit = 0;
    group.traverse((object) => {
      const light = object.geometry?.attributes.bakeLight;
      if (!light) return;
      vertices += light.count;
      for (let v = 0; v < light.count; v += 1) if (light.getX(v) + light.getY(v) + light.getZ(v) > 0.02) lit += 1;
    });
    assert.ok(vertices > 5000, 'the place has real geometry');
    assert.ok(lit / vertices > 0.2, `enough of it is lit (${(lit / vertices * 100).toFixed(0)}%)`);
  });
}
