import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { meadowPageUpdatePlan } from '../src/editor/stylized/meadow/MeadowPageUpdatePlan.js';
import { MeadowTileLayer } from '../src/editor/stylized/meadow/MeadowTileLayer.js';
import { MeadowGrassField } from '../src/editor/stylized/meadow/MeadowGrassField.js';
import { meadowBladeBoundsPadding, meadowCardBoundsPadding } from '../src/editor/stylized/meadow/MeadowPageBounds.js';

function packedPage() {
  const a = { output: { count: 10 }, buildId: 2, renderX: 0, renderZ: 0 };
  const b = { output: { count: 16 }, buildId: 1, renderX: 8, renderZ: 0 };
  const page = {
    stride: 64,
    slots: new Map([
      [a, { count: 10, source: 2, renderX: 0, renderZ: 0,
        ranges: [{ start: 16, count: 10, offset: 0 }] }],
      [b, { count: 16, source: 1, renderX: 8, renderZ: 0,
        ranges: [{ start: 0, count: 16, offset: 0 }] }],
    ]),
    order: [b, a],
    present: new Set([a, b]),
    geometry: { instanceCount: 26 },
  };
  return { page, a, b };
}

test('unchanged packed pages stay allocation-free despite slot and input order differences', () => {
  const { page, a, b } = packedPage();
  for (let i = 0; i < 3000; i += 1) {
    const plan = meadowPageUpdatePlan(page, i % 2 ? [a, b] : [b, a]);
    assert.equal(plan.writes.length, 0);
    assert.equal(plan.bytes, 0);
    assert.equal(plan.repackBytes, 0);
    assert.equal(plan.present, page.present);
    assert.equal(plan.order, page.order);
  }
});

test('fast path still invalidates changed origins, sources, membership and packed ranges', () => {
  const { page, a, b } = packedPage();
  assert.equal(meadowPageUpdatePlan(page, [a, b]).writes.length, 0);

  a.renderX += 1;
  assert.equal(meadowPageUpdatePlan(page, [a, b]).bytes, 10 * 4 * 4);
  a.renderX -= 1;

  a.buildId += 1;
  assert.equal(meadowPageUpdatePlan(page, [a, b]).bytes, 10 * 14 * 4);
  a.buildId -= 1;

  a.output.count += 1;
  assert.ok(meadowPageUpdatePlan(page, [a, b]).writes.length > 0);
  a.output.count -= 1;

  assert.ok(meadowPageUpdatePlan(page, [a]).writes.length > 0);
  page.slots.get(a).ranges.push({ start: 26, count: 0, offset: 10 });
  assert.ok(meadowPageUpdatePlan(page, [a, b]).writes.length > 0);
});

test('blade gust sheen shares the deforming vertex wind sample', () => {
  const root = new URL('../src/editor/stylized/meadow/', import.meta.url);
  const material = readFileSync(new URL('meadowBladeMaterial.js', root), 'utf8');
  const shape = readFileSync(new URL('meadowBladeShape.js', root), 'utf8');
  assert.match(material, /varyingProperty\('float', 'meadowGust'\)/);
  assert.match(material, /gustOutput: gust/);
  assert.doesNotMatch(material, /sampleWorldWindCanonical|meadowWindFrontNodes/);
  assert.match(shape, /gustOutput\.assign\(float\(0\)\)/);
  assert.match(shape, /gustOutput\.assign\(pressure\.clamp\(0, 1\)/);
  assert.equal(shape.split('sampleWorldWindCanonical(blade.canonical)').length - 1, 1);
});

test('field updates only fan out page-bound changes and reuse steady-frame state', () => {
  const root = new URL('../src/editor/stylized/meadow/', import.meta.url);
  const field = readFileSync(new URL('MeadowGrassField.js', root), 'utf8');
  const layer = readFileSync(new URL('MeadowTileLayer.js', root), 'utf8');
  assert.match(field, /if \(bladePadding !== this\.bladeBoundsPadding\)/);
  assert.match(field, /if \(cardPadding !== this\.cardBoundsPadding\)/);
  assert.match(field, /frame\.canonical = canonical/);
  assert.doesNotMatch(field, /Object\.assign\(this\.frameInputs/);
  assert.match(layer, /this\.origin\.x = origin\.x/);
  assert.match(layer, /this\.origin\.z = origin\.z/);
  assert.equal(layer.split('this.origin = { x: origin.x, z: origin.z }').length - 1, 1);
});

test('tile layer reuses its floating-origin snapshot and rebases only on change', () => {
  const rebaseCalls = [];
  const layer = Object.create(MeadowTileLayer.prototype);
  layer.origin = null;
  layer.updateSerial = 0;
  layer.staleTiles = [];
  layer.batchDirty = false;
  layer.batchBudget = { reset() {} };
  layer.batches = { rebase(...args) { rebaseCalls.push(args); } };
  layer.ground = { revision: 1 };
  layer.windowInputsChanged = () => false;
  layer.updateLayoutState = () => false;
  layer.commit = () => {};
  const camera = { x: 0, z: 0 };
  const origin = { x: 0, z: 0 };
  layer.update(camera, origin, 0, 1, null, false);
  const snapshot = layer.origin;
  for (let i = 0; i < 120; i += 1) {
    layer.update(camera, origin, 0, i / 60, null, false);
    assert.equal(layer.origin, snapshot);
  }
  origin.x = 48;
  origin.z = -32;
  layer.update(camera, origin, 0, 3, null, false);
  assert.equal(layer.origin, snapshot);
  assert.deepEqual(rebaseCalls.map(([dx, dz]) => [dx, dz]), [[-48, 32]]);
  assert.deepEqual(layer.origin, origin);
});

test('unchanged culling padding skips page-wide updates but live changes propagate', () => {
  const bladeChanges = [];
  const cardChanges = [];
  const field = Object.create(MeadowGrassField.prototype);
  const origin = { x: 0, z: 0 };
  field.terrainView = {
    floatingOrigin: { getState: () => origin },
    focusChunk: { chunkX: 1, chunkZ: 2 },
  };
  field.interactionOrigin = { x: 0, z: 0 };
  field.canonical = { x: 0, z: 0 };
  field.blades = {
    beginFrame() {}, update() {},
    batches: { setBoundsPadding(value) { bladeChanges.push(value); } },
  };
  field.cards = {
    beginFrame() {}, update() {},
    batches: { setBoundsPadding(value) { cardChanges.push(value); } },
  };
  const scalar = value => ({ value });
  field.uniforms = {
    growth: { maxHeight: 0.85, maxWidth: 0.08 },
    time: scalar(0),
    origin: { value: { set() {} } },
    bladeHeight: scalar(0.64),
    bladeWidth: scalar(0.071),
    heightScale: { value: { x: 0.8, y: 1.3 } },
    baseBend: scalar(0.1),
    widthScale: scalar(1),
    taper: scalar(0.62),
    curve: scalar(0.07),
    cardWidth: scalar(1.2),
    cardHeight: scalar(0.72),
    appearance: { lodWidenMax: scalar(2), lodThinning: scalar(1) },
  };
  field.tuning = { widthScale: scalar(1), flutterStrength: scalar(0.15) };
  field.dirtBladeCut = 0.25;
  field.skyView = null;
  field.ground = { beginFrame() {} };
  field.bladeBoundsPadding = meadowBladeBoundsPadding(field.uniforms, field.tuning, field.dirtBladeCut);
  field.cardBoundsPadding = meadowCardBoundsPadding(field.uniforms);
  const camera = { position: { x: 0, z: 0 } };

  for (let frame = 0; frame < 120; frame += 1) field.updateFrame(frame * 16, camera);
  assert.equal(bladeChanges.length, 0);
  assert.equal(cardChanges.length, 0);
  const cachedFrame = field.frameInputs;
  field.uniforms.growth.maxHeight *= 1.5;
  field.updateFrame(2000, camera);
  assert.equal(field.frameInputs, cachedFrame);
  assert.equal(bladeChanges.length, 1);
  assert.equal(cardChanges.length, 1);
  field.tuning.flutterStrength.value *= 2;
  field.updateFrame(2016, camera);
  assert.equal(bladeChanges.length, 2);
  assert.equal(cardChanges.length, 1);
  assert.ok(bladeChanges[1] > bladeChanges[0]);
});
