import assert from 'node:assert/strict';
import test from 'node:test';
import { bakeParticleAtlas } from '../src/editor/vfx/atlas/ParticleAtlasBaker.js';
import {
  ATLAS_SIZE,
  RAMP_COUNT,
  RAMP_HEIGHT_PX,
  RAMP_ROW,
  TILE,
  TILE_SIZE,
  TILES_PER_ROW,
} from '../src/editor/vfx/atlas/ParticleAtlasLayout.js';
import { defineParticleType } from '../src/editor/vfx/particles/ParticleTypeRegistry.js';
import { createSpellParticleTypes } from '../src/editor/vfx/types/index.js';

const baked = bakeParticleAtlas();

function tileAlpha(tile, x, y) {
  const column = tile % TILES_PER_ROW;
  const row = Math.floor(tile / TILES_PER_ROW);
  return baked.data[((row * TILE_SIZE + y) * ATLAS_SIZE + column * TILE_SIZE + x) * 4 + 3];
}

test('atlas is one 512² RGBA texture of 64 px tiles', () => {
  assert.equal(ATLAS_SIZE, 512);
  assert.equal(TILE_SIZE, 64);
  assert.equal(baked.data.length, 512 * 512 * 4);
});

test('atlas bake is deterministic for a seed', () => {
  const again = bakeParticleAtlas();
  assert.deepEqual(again.data, baked.data);
  const other = bakeParticleAtlas({ seed: 7 });
  assert.notDeepEqual(other.data, baked.data);
});

test('every named tile has coverage and a clear border for mip padding', () => {
  for (const [name, tile] of Object.entries(TILE)) {
    let covered = 0;
    for (let y = 0; y < TILE_SIZE; y += 1) {
      for (let x = 0; x < TILE_SIZE; x += 1) if (tileAlpha(tile, x, y) > 32) covered += 1;
    }
    assert.ok(covered > 20, `tile ${name} is empty`);
    for (let index = 0; index < TILE_SIZE; index += 1) {
      assert.equal(tileAlpha(tile, index, 0), 0, `tile ${name} bleeds at the bottom edge`);
      assert.equal(tileAlpha(tile, 0, index), 0, `tile ${name} bleeds at the left edge`);
    }
  }
});

test('ramps rise in emission from cold to hot', () => {
  for (let ramp = 0; ramp < RAMP_COUNT; ramp += 1) {
    const row = RAMP_ROW * TILE_SIZE + ramp * RAMP_HEIGHT_PX + 2;
    const emission = (x) => baked.data[(row * ATLAS_SIZE + x) * 4 + 3];
    assert.ok(emission(4) < 10, `ramp ${ramp} glows when cold`);
    assert.ok(emission(ATLAS_SIZE - 4) > 200, `ramp ${ramp} is dim when hot`);
  }
});

test('spell particle types all validate and reference real sub-emitters', () => {
  const registry = createSpellParticleTypes();
  assert.ok(registry.size > 70);
  for (let index = 0; index < registry.size; index += 1) {
    const type = registry.get(index);
    assert.ok(type.tiles[0] <= type.tiles[1], `${type.id} tile span is reversed`);
    assert.ok(type.tiles[1] < RAMP_ROW * TILES_PER_ROW, `${type.id} samples the ramp row as a tile`);
  }
});

test('particle type definitions reject unknown modes', () => {
  assert.throws(() => defineParticleType('bad', { orient: 'sideways' }), /unknown orient/);
  assert.throws(() => defineParticleType('bad', { collide: 'explode' }), /unknown collide/);
  assert.throws(() => defineParticleType('bad', { life: 0 }), /life must be positive/);
});
