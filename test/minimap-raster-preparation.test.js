import assert from 'node:assert/strict';
import test from 'node:test';
import { MinimapRaster } from '../src/editor/map/MinimapRaster.js';
import { shadeMinimapPixel } from '../src/editor/map/minimapRelief.js';
import { hexToRgbBytes } from '../src/editor/tileCatalog.js';
import { register } from 'node:module';

register('./fixtures/css-loader.mjs', import.meta.url);
const { EditorUi } = await import('../src/editor/EditorUi.js');

test('sliced minimap matches exact raster, reuses samples and queries only local objects', () => {
  let heightCalls = 0, tileCalls = 0, queries = 0, revision = 0;
  const height = (x, z) => Math.sin(x * .2) * 10 + z * .3;
  const tile = { color: '#77aa33', terrainClass: 'land' };
  const raster = new MinimapRaster({ size: 32,
    heightField: { getCellHeight: (x, z) => { heightCalls++; return height(x, z); } },
    tileMap: { tileSize: 2, get: () => { tileCalls++; return 4; }, getTileDefinition: () => tile },
    objectMap: { get revision() { return revision; }, queryBounds: bounds => { queries++; assert.ok(bounds.maxX < 100); return []; },
      list: () => assert.fail('global objects scan') }, objectByKey: new Map() });
  const context = { createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }) };
  const build = center => {
    const job = raster.build(center, 41, context);
    let turns = 0;
    for (;;) {
      const before = heightCalls + tileCalls, step = job.next();
      assert.ok(heightCalls + tileCalls - before <= 256);
      if (step.done) return step.value;
      assert.ok(++turns < 100);
    }
  };
  const result = build({ x: 0, z: 0 });
  const cell = p => -20 + Math.floor(p * 41 / 32), f = (x, z) => Math.fround(height(x, z));
  for (let row = 0; row < 32; row++) for (let column = 0; column < 32; column++) {
    const rgb = shadeMinimapPixel(hexToRgbBytes(tile.color), { water: false, height: f(cell(column), cell(row)),
      neighbours: { left: f(cell(column - 1), cell(row)), right: f(cell(column + 1), cell(row)),
        up: f(cell(column), cell(row - 1)), down: f(cell(column), cell(row + 1)) }, spacing: 41 / 32 * 2 });
    assert.deepEqual([...result.image.data.subarray((row * 32 + column) * 4, (row * 32 + column) * 4 + 4)], [...rgb, 255]);
  }
  const before = heightCalls + tileCalls;
  build({ x: 0, z: 0 }); assert.equal(heightCalls + tileCalls, before);
  revision++; build({ x: 1, z: 0 });
  assert.ok(heightCalls + tileCalls - before < before / 2, 'an unaligned shift reuses identical cells without shifting pixels');
  assert.equal(queries, 3); raster.dispose();
});

test('recentering during a redraw keeps the old bitmap coordinates until each replacement publishes', () => {
  const published = [], ui = Object.assign(Object.create(EditorUi.prototype), {
    minimapCenter: { x: 0, z: 0 }, minimapCells: 256, minimapBudget: {},
    minimap: { getContext: () => ({}) }, renderMinimapBurgs() {},
    minimapRaster: { revision: () => 'world-1', *build(center, cells) { yield; yield; return { center, cells }; },
      publish: result => published.push(result.center) },
  });
  ui.updateMinimap(); ui.advanceMinimap();
  ui.minimapCenter = { x: 40, z: -20 }; ui.updateMinimap();
  assert.equal(ui.minimapPublishedWindow, undefined);
  ui.advanceMinimap(); ui.advanceMinimap();
  assert.deepEqual(ui.minimapPublishedWindow.center, { x: 0, z: 0 });
  assert.ok(ui.minimapRequest, 'the newer request survives publication of the older bitmap');
  ui.advanceMinimap(); ui.advanceMinimap(); ui.advanceMinimap();
  assert.deepEqual(ui.minimapPublishedWindow.center, { x: 40, z: -20 });
  assert.equal(ui.minimapRequest, null);
  assert.deepEqual(published, [{ x: 0, z: 0 }, { x: 40, z: -20 }]);
});
