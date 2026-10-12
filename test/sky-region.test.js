import assert from 'node:assert/strict';
import test from 'node:test';

import {
  climateWeights,
  LOCAL_SHARE,
  NEUTRAL_SKY_REGION,
  skyPersonality,
  skyRegionAt,
} from '../src/editor/stylized/sky/skyRegionClimate.js';
import { regionalSkyLook } from '../src/editor/stylized/sky/regionalSkyLook.js';

const LOOK = Object.freeze({
  lowColor: '#c5e7df', highColor: '#438ec5', sunColor: '#fff0c9', sunGlowColor: '#ffe8ad',
  cloudCore: '#e0e0e0', cloudEdge: '#ffffff', cloudRim: '#ffffff', fogColor: '#a5ced3',
  groundLightColor: '#78945d', directionalColor: '#fff0c9',
  fogDensityScale: 1, directionalIntensity: 2.8, ambientSaturation: 1, ambientIntensity: 1.3,
  sunGlowIntensity: 0.4, cloudDensity: 0.5, cloudOpacity: 0.6,
});

function luminance(hex) {
  const v = parseInt(hex.slice(1), 16);
  return 0.2126 * (v >> 16) + 0.7152 * ((v >> 8) & 255) + 0.0722 * (v & 255);
}

test('biome lists become normalised climate weights', () => {
  const weights = climateWeights([1, 1, 12, 9]);
  assert.equal(weights.arid, 0.5);
  assert.equal(weights.wetland, 0.25);
  assert.equal(weights.boreal, 0.25);
  assert.equal(climateWeights([]).temperate, 1);
});

test('the far rings decide the region; the near ground only nudges it', () => {
  // Desert everywhere except a wetland within the local rings.
  const getBiome = (cellX, cellZ) => (Math.hypot(cellX, cellZ) < 300 ? 12 : 1);
  const region = skyRegionAt({ getBiome, tileSize: 2, x: 0, z: 0 });
  assert.ok(region.weights.arid > 0.75);
  assert.ok(Math.abs(region.weights.wetland - LOCAL_SHARE) < 1e-9);
});

test('high ground turns into alpine air', () => {
  const region = skyRegionAt({ getBiome: () => 6, tileSize: 2, x: 0, z: 0, heightAboveSea: 2500 });
  assert.equal(region.weights.alpine, 1);
});

test('personality changes little over a few hundred metres and a lot over tens of km', () => {
  const here = skyPersonality(0, 0, 7);
  const near = skyPersonality(300, 0, 7);
  let farthest = 0;
  for (let i = 1; i <= 8; i += 1) {
    const far = skyPersonality(i * 40000, i * 17000, 7);
    farthest = Math.max(farthest, Math.abs(far.haze - here.haze));
  }
  assert.ok(Math.abs(near.haze - here.haze) < 0.2);
  assert.ok(farthest > 0.3);
});

test('temperate air with a neutral personality leaves the look unchanged', () => {
  const result = regionalSkyLook(LOOK, NEUTRAL_SKY_REGION);
  for (const key of Object.keys(LOOK)) {
    if (typeof LOOK[key] === 'number') assert.ok(Math.abs(result[key] - LOOK[key]) < 1e-9, key);
    else assert.equal(result[key], LOOK[key], key);
  }
});

test('regions read differently: desert hazy and dry, wetland misty and dim', () => {
  const region = (climate) => ({
    weights: { temperate: 0, boreal: 0, arid: 0, tropical: 0, wetland: 0, coastal: 0, alpine: 0, [climate]: 1 },
    personality: { haze: 0, warmth: 0, cloudiness: 0 },
  });
  const desert = regionalSkyLook(LOOK, region('arid'));
  const marsh = regionalSkyLook(LOOK, region('wetland'));
  assert.ok(desert.cloudDensity > LOOK.cloudDensity, 'fewer clouds over desert');
  assert.ok(marsh.fogDensityScale > desert.fogDensityScale, 'wetland mistier than desert');
  assert.ok(marsh.directionalIntensity < LOOK.directionalIntensity, 'wetland sun weaker');
});

test('regional air is relative: a night sky stays dark', () => {
  const night = { ...LOOK, lowColor: '#1a2433', highColor: '#050b1c', fogColor: '#263d52' };
  const desert = regionalSkyLook(night, {
    weights: { temperate: 0, boreal: 0, arid: 1, tropical: 0, wetland: 0, coastal: 0, alpine: 0 },
    personality: { haze: 1, warmth: 1, cloudiness: 0 },
  });
  assert.ok(luminance(desert.highColor) < 40);
  assert.ok(luminance(desert.lowColor) < 70);
});

test('the controller eases toward a travelled region and snaps on a jump', async () => {
  const { SkyLookController } = await import('../src/editor/stylized/sky/SkyLookController.js');
  const { resolveSkyLook } = await import('../src/editor/stylized/sky/SkyLook.js');
  const sky = resolveSkyLook({ ...LOOK, sunElevation: 40, sunAzimuth: 200, sunEmission: 1, cloudShadows: { strength: 0.3 } }, 'configured');
  const applied = [];
  const controller = new SkyLookController({
    skyView: { config: { sky }, applyLook: (look) => applied.push(look) },
    preset: 'configured',
  });
  const wetland = (jump) => ({
    weights: { temperate: 0, boreal: 0, arid: 0, tropical: 0, wetland: 1, coastal: 0, alpine: 0 },
    personality: { haze: 0, warmth: 0, cloudiness: 0 },
    jump,
  });
  controller.setRegion(wetland(false));
  controller.update(1);
  assert.ok(controller.region.weights.wetland > 0 && controller.region.weights.wetland < 0.2, 'eases');
  controller.setRegion(wetland(true));
  controller.update(0.016);
  assert.equal(controller.region.weights.wetland, 1, 'snaps after a teleport');
  assert.ok(applied.at(-1).fogDensityScale > 1.5);
});
