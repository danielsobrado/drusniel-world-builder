import assert from 'node:assert/strict';
import test from 'node:test';
import { GRASS_MARK, grassMarkCode, MeadowInteractionMap } from '../src/editor/stylized/meadow/MeadowInteractionMap.js';

function texel(map, x, z) {
  const px = Math.floor(((x - map.center.x) / map.worldSize + 0.5) * map.resolution);
  const py = Math.floor(((z - map.center.y) / map.worldSize + 0.5) * map.resolution);
  const offset = (py * map.resolution + px) * 4;
  return { press: map.pixels[offset], mark: map.pixels[offset + 1], kind: map.pixels[offset + 2] };
}

function spellMap() {
  return new MeadowInteractionMap({ resolution: 256, worldSize: 64 });
}

test('markDisc writes the mark amount and kind without pressing the grass', () => {
  const map = spellMap();
  map.markDisc(4, -3, 5, GRASS_MARK.SCORCH, 1, 0.5);
  const centre = texel(map, 4, -3);
  assert.equal(centre.mark, 255);
  assert.equal(centre.kind, grassMarkCode(GRASS_MARK.SCORCH));
  assert.equal(centre.press, 0, 'a mark is not a press');
  assert.ok(texel(map, 4 + 4.4, -3).mark < 60, 'eases out toward the rim');
  assert.equal(texel(map, 4 + 6, -3).mark, 0);
  assert.equal(map.markPeak, 255);
});

test('the clearly stronger mark sets the kind where marks overlap', () => {
  const map = spellMap();
  map.markDisc(0, 0, 4, GRASS_MARK.SINGE, 1, 0.5);
  map.markDisc(0, 0, 4, GRASS_MARK.FROST, 0.4, 0.5);
  assert.equal(texel(map, 0, 0).kind, grassMarkCode(GRASS_MARK.SINGE), 'a weaker mark leaves the kind alone');
  const fresh = spellMap();
  fresh.markDisc(0, 0, 4, GRASS_MARK.FROST, 0.3, 0.5);
  fresh.markDisc(0, 0, 4, GRASS_MARK.SCORCH, 1, 0.5);
  assert.equal(texel(fresh, 0, 0).kind, grassMarkCode(GRASS_MARK.SCORCH));
});

test('marks fade on their own clock, moonlight far faster than scorch', () => {
  const map = spellMap();
  map.markDisc(-10, 0, 3, GRASS_MARK.MOON, 1, 0.9);
  map.markDisc(10, 0, 3, GRASS_MARK.SCORCH, 1, 0.9);
  for (let frame = 0; frame < 120; frame += 1) map.update(null);
  const moon = texel(map, -10, 0).mark;
  const scorch = texel(map, 10, 0).mark;
  assert.ok(moon < 150, `moonlight should be fading after two seconds (${moon})`);
  assert.ok(scorch > 235, `scorch should barely have faded after two seconds (${scorch})`);
  for (let frame = 0; frame < 300; frame += 1) map.update(null);
  assert.equal(texel(map, -10, 0).mark, 0, 'moonlight is gone within seconds');
  assert.ok(map.markPeak > 0, 'the scorch is still there');
});

test('the spell map follows the player without stamping a body, and marks stay put in the world', () => {
  const map = spellMap();
  map.update({ x: 0, y: 0, z: 0 }, { stamp: false });
  map.markDisc(6, 6, 2, GRASS_MARK.WITHER, 1, 0.8);
  assert.equal(texel(map, 0, 0).press, 0, 'no body pressed in');
  map.update({ x: 8, y: 0, z: 0 }, { stamp: false });
  assert.equal(map.center.x, 8);
  const moved = texel(map, 6, 6);
  assert.ok(moved.mark > 230, 'the mark scrolled with the window');
  assert.equal(moved.kind, grassMarkCode(GRASS_MARK.WITHER));
  assert.equal(texel(map, 8, 0).press, 0);
});

test('a map with nothing in it reports no ink', () => {
  const map = spellMap();
  assert.equal(map.hasMarksOrPress(), false);
  map.markDisc(500, 500, 3, GRASS_MARK.ACID);
  map.markDisc(0, 0, 3, GRASS_MARK.ACID, 0);
  assert.equal(map.hasMarksOrPress(), false);
});
