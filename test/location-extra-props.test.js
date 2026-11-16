import assert from 'node:assert/strict';
import test from 'node:test';
import * as frostgardHoldExtra from '../src/editor/locations/generators/frostgardHoldExtraProps.js';
import * as glacierExtra from '../src/editor/locations/generators/glacierExtraProps.js';
import * as glacierFrontExtra from '../src/editor/locations/generators/glacierFrontExtraProps.js';
import * as mineExtra from '../src/editor/locations/generators/mineExtraProps.js';
import * as stoneholdExtra from '../src/editor/locations/generators/stoneholdExtraProps.js';
import * as umbraExtra from '../src/editor/locations/generators/umbraExtraProps.js';

const AREAS = Object.freeze({
  mine: mineExtra,
  umbraCavern: umbraExtra,
  stoneholdHold: stoneholdExtra,
  frostgardGlacierCave: glacierExtra,
  frostgardGlacierFront: glacierFrontExtra,
  frostgardHold: frostgardHoldExtra,
});

function mockBuilder() {
  const props = [];
  const lights = [];
  const flames = [];
  const blocks = [];
  return {
    props,
    lights,
    flames,
    blocks,
    prop(material, geometry, tint = 0xffffff) {
      assert.ok(typeof material === 'string' && material.length > 0);
      assert.ok(geometry, `geometry missing for ${material}`);
      const geoms = Array.isArray(geometry) ? geometry : [geometry];
      for (const g of geoms) {
        const pos = g.getAttribute('position');
        assert.ok(pos && pos.count > 0 && pos.array.every(Number.isFinite));
      }
      props.push({ material, tint });
    },
    light(at, tint, intensity, range) { lights.push({ at, tint, intensity, range }); },
    flame(at, opts) { flames.push({ at, ...opts }); },
    nav: { block(at, radius, height) { blocks.push({ at, radius, height }); } },
  };
}

test('every underground and glacier area exports at least 5 multi-part detailed prop builders', () => {
  for (const [areaName, mod] of Object.entries(AREAS)) {
    const builders = Object.entries(mod).filter(([, v]) => typeof v === 'function');
    assert.ok(builders.length >= 5, `${areaName} expected >= 5 prop builders, got ${builders.length}`);
    for (const [fnName, fn] of builders) {
      const b = mockBuilder();
      fn(b, { x: 0, y: 0, z: 0 }, 0.5);
      assert.ok(b.props.length >= 3, `${areaName}.${fnName} should emit multi-part detailed geometry (got ${b.props.length} parts)`);
    }
  }
});
