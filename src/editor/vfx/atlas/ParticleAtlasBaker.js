import * as THREE from 'three';
import { createNoise } from '../math/vfxNoise.js';
import { createRandom } from '../math/vfxRandom.js';
import {
  paintAcidSplat,
  paintBlight,
  paintCracks,
  paintFrost,
  paintRuneCircle,
  paintScorch,
} from './decalPainters.js';
import {
  ATLAS_SIZE,
  RAMP_COUNT,
  RAMP_HEIGHT_PX,
  RAMP_ROW,
  TILE,
  TILE_SIZE,
  TILES_PER_ROW,
} from './ParticleAtlasLayout.js';
import { paintCloud, paintFireFrame, paintFlameTongue, paintFogBank, paintSmoke } from './puffPainters.js';
import { evaluateRamp, RAMP_KEYS } from './rampPainter.js';
import {
  paintBeam,
  paintBolt,
  paintBubble,
  paintDroplet,
  paintFlare,
  paintGlow,
  paintMote,
  paintRing,
  paintSnowflake,
  paintStarburst,
  paintStreak,
  paintTwinkle,
  paintWisp,
} from './shapePainters.js';
import { paintAsh, paintChunk, paintCrystal, paintShard } from './solidPainters.js';
import { createTileSurface } from './tileSurface.js';

/**
 * Which painter fills which tile. Painters receive (surface, noise, random,
 * variant); the table is the whole atlas definition.
 */
function tilePainters() {
  const painters = new Map();
  const span = (first, last, painter) => {
    for (let tile = first; tile <= last; tile += 1) painters.set(tile, (s, n, r) => painter(s, n, r, tile - first));
  };
  const fireFrames = TILE.FIRE_LAST - TILE.FIRE_FIRST + 1;
  span(TILE.SMOKE_FIRST, TILE.SMOKE_LAST, (s, n, r, variant) => paintSmoke(s, n, variant));
  span(TILE.FIRE_FIRST, TILE.FIRE_LAST, (s, n, r, frame) => paintFireFrame(s, n, frame, fireFrames));
  span(TILE.CHUNK_FIRST, TILE.CHUNK_LAST, (s, n, r, variant) => paintChunk(s, n, r, variant));
  span(TILE.SHARD_FIRST, TILE.SHARD_LAST, (s, n, r, variant) => paintShard(s, n, r, variant));
  span(TILE.SCORCH_FIRST, TILE.SCORCH_LAST, (s, n, r, variant) => paintScorch(s, n, variant));
  span(TILE.FLAME_FIRST, TILE.FLAME_LAST, (s, n, r, variant) => paintFlameTongue(s, n, variant));
  painters.set(TILE.GLOW, (s) => paintGlow(s));
  painters.set(TILE.FLARE, (s) => paintFlare(s));
  painters.set(TILE.STREAK, (s) => paintStreak(s));
  painters.set(TILE.RING_THIN, (s, n) => paintRing(s, n, 0.86, 0.045, 0));
  painters.set(TILE.RING_SOFT, (s, n) => paintRing(s, n, 0.72, 0.13, 0.6));
  painters.set(TILE.BEAM, (s, n) => paintBeam(s, n));
  painters.set(TILE.BOLT, (s) => paintBolt(s));
  painters.set(TILE.DROPLET, (s) => paintDroplet(s));
  painters.set(TILE.FROST_DECAL, (s, n) => paintFrost(s, n));
  painters.set(TILE.RUNE_CIRCLE, (s, n, r) => paintRuneCircle(s, n, r));
  painters.set(TILE.ACID_SPLAT, (s, n, r) => paintAcidSplat(s, n, r));
  painters.set(TILE.BLIGHT_DECAL, (s, n) => paintBlight(s, n));
  painters.set(TILE.BUBBLE, (s) => paintBubble(s));
  painters.set(TILE.MOTE, (s) => paintMote(s));
  painters.set(TILE.CRACKS, (s, n, r) => paintCracks(s, n, r));
  painters.set(TILE.WISP, (s, n) => paintWisp(s, n));
  painters.set(TILE.ASH, (s, n, r) => paintAsh(s, n, r));
  painters.set(TILE.CLOUD, (s, n) => paintCloud(s, n));
  painters.set(TILE.SNOWFLAKE, (s) => paintSnowflake(s));
  painters.set(TILE.TWINKLE, (s) => paintTwinkle(s));
  painters.set(TILE.STARBURST, (s, n, r) => paintStarburst(s, n, r));
  painters.set(TILE.FOG_BANK, (s, n) => paintFogBank(s, n));
  painters.set(TILE.CRYSTAL, (s, n, r) => paintCrystal(s, n, r));
  return painters;
}

function toByte(value) {
  return Math.max(0, Math.min(255, Math.round(value * 255)));
}

function blitTile(atlas, surface, tile) {
  const column = tile % TILES_PER_ROW;
  const row = Math.floor(tile / TILES_PER_ROW);
  const { pixels, size } = surface;
  for (let y = 0; y < size; y += 1) {
    const atlasRow = row * TILE_SIZE + y;
    for (let x = 0; x < size; x += 1) {
      const source = (y * size + x) * 4;
      const target = (atlasRow * ATLAS_SIZE + column * TILE_SIZE + x) * 4;
      atlas[target] = toByte(pixels[source]);
      atlas[target + 1] = toByte(pixels[source + 1]);
      atlas[target + 2] = toByte(pixels[source + 2]);
      atlas[target + 3] = toByte(pixels[source + 3]);
    }
  }
}

function paintRamps(atlas) {
  const colour = [0, 0, 0, 0];
  for (let ramp = 0; ramp < RAMP_COUNT; ramp += 1) {
    const keys = RAMP_KEYS[ramp];
    for (let x = 0; x < ATLAS_SIZE; x += 1) {
      evaluateRamp(keys, (x + 0.5) / ATLAS_SIZE, colour);
      for (let y = 0; y < RAMP_HEIGHT_PX; y += 1) {
        const atlasRow = RAMP_ROW * TILE_SIZE + ramp * RAMP_HEIGHT_PX + y;
        const target = (atlasRow * ATLAS_SIZE + x) * 4;
        atlas[target] = toByte(colour[0]);
        atlas[target + 1] = toByte(colour[1]);
        atlas[target + 2] = toByte(colour[2]);
        atlas[target + 3] = toByte(colour[3]);
      }
    }
  }
}

/**
 * Rasterises every tile and ramp into one RGBA8 buffer. Pure and
 * deterministic for a seed, so tests can bake it without a GPU.
 *
 * @returns {{ data: Uint8Array, size: number, milliseconds: number }}
 */
export function bakeParticleAtlas({ seed = 1337 } = {}) {
  const started = globalThis.performance?.now?.() ?? Date.now();
  const atlas = new Uint8Array(ATLAS_SIZE * ATLAS_SIZE * 4);
  const noise = createNoise(seed);
  const surface = createTileSurface();
  for (const [tile, painter] of tilePainters()) {
    surface.clear();
    painter(surface, noise, createRandom(seed * 131 + tile * 977));
    blitTile(atlas, surface, tile);
  }
  paintRamps(atlas);
  const finished = globalThis.performance?.now?.() ?? Date.now();
  return { data: atlas, size: ATLAS_SIZE, milliseconds: finished - started };
}

/** Uploads a baked atlas as a mipmapped linear texture. */
export function createParticleAtlasTexture(baked = bakeParticleAtlas()) {
  const texture = new THREE.DataTexture(baked.data, baked.size, baked.size, THREE.RGBAFormat);
  texture.name = 'vfx-particle-atlas';
  texture.colorSpace = THREE.NoColorSpace;
  texture.flipY = false;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}
