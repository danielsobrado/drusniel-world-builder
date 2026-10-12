import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three/webgpu';

import { SettlementGroundBounce, TOWN_BOUNCE, townBounceWeight } from '../src/editor/world/settlements/view/SettlementGroundBounce.js';

test('the town ground takes over the bounce toward a town centre and fades out past its edge', () => {
  assert.equal(townBounceWeight(null), 0);
  assert.ok(townBounceWeight({ distance: 0, radius: 100 }) > 0.8);
  assert.equal(townBounceWeight({ distance: 200, radius: 100 }), 0);
  const edge = townBounceWeight({ distance: 110, radius: 100 });
  assert.ok(edge > 0 && edge < townBounceWeight({ distance: 50, radius: 100 }));
});

test('the bounce keeps the look as its base and re-bases when the look writes a new colour', () => {
  const light = new THREE.HemisphereLight('#ffffff', '#00ff00', 1);
  const bounce = new SettlementGroundBounce(() => light);
  const centre = { distance: 0, radius: 100 };
  bounce.update(centre);
  const inTown = light.groundColor.clone();
  bounce.update(centre);
  assert.ok(light.groundColor.equals(inTown), 'repeated frames do not drift');
  bounce.update(null);
  assert.ok(light.groundColor.equals(new THREE.Color('#00ff00')), 'leaving town restores the look');
  light.groundColor.set('#0000ff');
  bounce.update(centre);
  const expected = new THREE.Color('#0000ff').lerp(TOWN_BOUNCE, townBounceWeight(centre));
  assert.ok(light.groundColor.equals(expected), 'a new look colour becomes the base');
});
