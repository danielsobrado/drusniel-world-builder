import test from 'node:test';
import assert from 'node:assert/strict';

import { airCharacter, applyRegionalCharacter } from '../src/editor/stylized/sky/regionalSkyLook.js';
import { airOf, skyRegionAt } from '../src/editor/stylized/sky/skyRegionClimate.js';
import { resolveSkyLook } from '../src/editor/stylized/sky/SkyLook.js';
import { SkyLookController } from '../src/editor/stylized/sky/SkyLookController.js';
import { snowLightFor } from '../src/editor/stylized/sky/skyLight.js';

const SKY = {
  lowColor: '#9cc9e2', highColor: '#3f83c2', sunColor: '#fff4dc', sunGlowColor: '#ffd7a6',
  cloudCore: '#b8c6d2', cloudEdge: '#f7fbff', cloudRim: '#fff3dc', fogColor: '#9cc9e2',
  groundLightColor: '#6f784d', directionalColor: '#fff3dc', sunElevation: 10, sunAzimuth: 258,
  sunEmission: 1.4, sunGlowIntensity: 0.45, cloudOpacity: 0.62, cloudDensity: 0.56, cloudSharpness: 0.24,
  ambientIntensity: 2, directionalIntensity: 3, cloudShadows: { enabled: true, strength: 0.45 },
};
const LOOK = resolveSkyLook(SKY, 'configured');
const region = (air, personality = {}) => ({ air, personality });

test('mountains over rainforest wear mist; mountains over desert stand in clear air', () => {
  const wet = skyRegionAt({ getBiome: () => 8, tileSize: 2, x: 0, z: 0, heightAboveSea: 2000 });
  const dry = skyRegionAt({ getBiome: () => 1, tileSize: 2, x: 0, z: 0, heightAboveSea: 2000 });
  assert.equal(wet.weights.alpine, 1);
  assert.equal(dry.weights.alpine, 1);
  const wetLook = applyRegionalCharacter(LOOK, airCharacter({ ...wet, personality: {} }));
  const dryLook = applyRegionalCharacter(LOOK, airCharacter({ ...dry, personality: {} }));
  assert.ok(wetLook.mist > 0.2, 'wet alpine is misty');
  assert.equal(dryLook.mist, 0, 'dry alpine is clear');
  assert.ok(wetLook.fogDensityScale > dryLook.fogDensityScale * 1.4);
  // Height cools the air.
  assert.ok(wet.air.temperature < airOf([8]).temperature);
});

test('neutral air leaves the look alone', () => {
  const result = applyRegionalCharacter(LOOK, airCharacter(region({ moisture: 0.5, temperature: 0.5 })));
  for (const key of Object.keys(LOOK)) {
    if (typeof LOOK[key] === 'number') assert.ok(Math.abs(result[key] - LOOK[key]) < 1e-9, key);
    else assert.equal(result[key], LOOK[key], key);
  }
});

test('cloud form: warm damp air builds cumulus, cold dry air draws wisps', () => {
  const warm = applyRegionalCharacter(LOOK, airCharacter(region({ moisture: 0.8, temperature: 0.9 }, { cloudForm: 0.6 })));
  const cold = applyRegionalCharacter(LOOK, airCharacter(region({ moisture: 0.2, temperature: 0.05 }, { cloudForm: -0.4 })));
  assert.ok(warm.cloudSharpness < LOOK.cloudSharpness && warm.cloudDetail < 1, 'cumulus: crisp, rounded');
  assert.ok(cold.cloudSharpness > LOOK.cloudSharpness && cold.cloudDetail > 1, 'wisps: soft, broken');
});

test('snow: cold dry powder is bright with deep blue shade, damp snow duller and greyer', () => {
  const powder = applyRegionalCharacter(LOOK, airCharacter(region({ moisture: 0.2, temperature: 0 })));
  const slush = applyRegionalCharacter(LOOK, airCharacter(region({ moisture: 0.95, temperature: 0.6 })));
  assert.ok(powder.snowBrightness > slush.snowBrightness);
  assert.ok(powder.snowShade > slush.snowShade);
  const powderLight = snowLightFor(powder);
  const slushLight = snowLightFor(slush);
  const blueness = (tint) => tint[2] - tint[0];
  assert.ok(blueness(powderLight.shadeTint) > blueness(slushLight.shadeTint));
});

test('the running clock blends neighbouring presets so the sun moves continuously', () => {
  const applied = [];
  const controller = new SkyLookController({
    skyView: { config: { sky: SKY }, applyLook: (look) => applied.push(look) },
    preset: 'configured',
  });
  const morning = resolveSkyLook(SKY, 'stillmeadow');
  const noon = resolveSkyLook(SKY, 'highfield');
  controller.setTimeBlend({ stillmeadow: 0.5, highfield: 0.5 });
  controller.update(0.016);
  const half = applied.at(-1).sunElevation;
  assert.ok(Math.abs(half - (morning.sunElevation + noon.sunElevation) / 2) < 1e-6);
  const count = applied.length;
  controller.setTimeBlend({ stillmeadow: 0.5, highfield: 0.5 });
  controller.update(0.016);
  assert.equal(applied.length, count, 'a repeated blend writes nothing');
  controller.setTimeBlend({ stillmeadow: 0.25, highfield: 0.75 });
  controller.update(0.016);
  assert.equal(controller.preset, 'highfield');
  assert.ok(applied.at(-1).sunElevation > half === noon.sunElevation > morning.sunElevation);
});
