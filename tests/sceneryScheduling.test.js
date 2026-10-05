import assert from 'node:assert/strict';
import test from 'node:test';
import { StylizedSurfaceView } from '../src/editor/stylized/StylizedSurfaceViewBase.js';
import { setUnderwaterBlend } from '../src/editor/water/underwaterState.js';

function fixture() {
  const calls = [];
  const record = name => () => calls.push(name);
  const surface = Object.assign(Object.create(StylizedSurfaceView.prototype), {
    enabled: true, beginFrame: record('collision'),
    terrainView: { floatingOrigin: { toCanonical: () => ({ x: 0, z: 0 }) } },
    config: { rocks: { radius: 1, falloff: 1 } }, objectMap: { list: () => [] },
    slots: [], detailViews: [], waterSlots: [{ update: record('water') }],
    skyView: { update: record('sky') }, meadowGrass: { update: record('grass') },
    rockView: { update: record('rocks'), getPlacements: () => [] },
    treeView: { update: record('trees') }, bushView: { update: record('bushes') },
    updateForestGroundTextures: record('ground'), prewarmOneDistantWaterSlot() {},
  });
  for (const name of ['rock', 'tree', 'bush', 'detail', 'grass', 'flower']) {
    surface[`${name}BuildQueue`] = { flush: record(`${name} flush`), retain() {}, enqueue() {} };
  }
  return { surface, calls };
}

test('visible meadow gets shared work time after collision preparation and before scenery rebuilds', () => {
  const { surface, calls } = fixture();
  surface.update(1000, { position: { x: 0, z: 0 } });
  assert.deepEqual(calls.slice(0, 4), ['collision', 'sky', 'grass', 'rocks']);
  assert.equal(calls.filter(name => name === 'grass').length, 1);
  for (const name of ['rock flush', 'tree flush', 'bush flush', 'detail flush', 'ground']) {
    assert.ok(calls.indexOf(name) > calls.indexOf('grass'), name);
  }
});

test('submerged scenery suspension still prepares collision and updates water without grass work', () => {
  const { surface, calls } = fixture();
  try {
    setUnderwaterBlend(1);
    surface.update(1000, { position: { x: 0, z: 0 } });
    assert.deepEqual(calls, ['collision', 'sky', 'water']);
  } finally { setUnderwaterBlend(0); }
});

test('continuous grass preparation leaves regular progress for scenery within the same allowance', () => {
  const { surface } = fixture();
  let remaining = 0, grassProgress = 0, rockProgress = 0;
  const work = increment => { if (remaining > 0) { remaining = 0; increment(); } };
  surface.meadowGrass.update = () => work(() => grassProgress++);
  surface.rockBuildQueue.flush = () => work(() => rockProgress++);
  for (let frame = 0; frame < 8; frame++) {
    remaining = 0.25;
    surface.update(frame * 10, { position: { x: 0, z: 0 } });
  }
  assert.equal(grassProgress, 6);
  assert.equal(rockProgress, 2);
});
