import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three/webgpu';
import { vec3 } from 'three/tsl';
import { buildShader } from '../test/helpers/buildShader.js';
import {
  AMBIENT_CANOPY_OCCLUSION,
  AMBIENT_CONTACT_OCCLUSION,
  BOUNCE_ALBEDO_GAIN_MAX,
  worldSurfaceAmbientCpu,
} from '../src/editor/stylized/worldSurfaceContext/WorldSurfaceAmbient.js';
import { rockShadeEmission, treeBarkEmission } from '../src/editor/stylized/forest/foliageLight.js';

const GROUND = [0.06, 0.07, 0.04];
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} vs ${b}`);

test('PR 9 outside the WSC window the fills are exactly the old hemisphere ones', () => {
  const { skyVisibility, groundBounce } = worldSurfaceAmbientCpu(
    { validity: 0, canopy: 1, contact: 1, albedo: [0.8, 0.8, 0.8] }, GROUND);
  close(skyVisibility, 1);
  groundBounce.forEach((c, i) => close(c, GROUND[i]));
});

test('PR 9 a closed canopy and an occluded foot dim the sky fill; an open meadow keeps it', () => {
  const meadow = worldSurfaceAmbientCpu({ validity: 1, canopy: 0, contact: 0, albedo: [0.2, 0.2, 0.2] }, GROUND);
  close(meadow.skyVisibility, 1);
  const wood = worldSurfaceAmbientCpu({ validity: 1, canopy: 1, contact: 1, albedo: [0.2, 0.2, 0.2] }, GROUND);
  close(wood.skyVisibility, (1 - AMBIENT_CANOPY_OCCLUSION) * (1 - AMBIENT_CONTACT_OCCLUSION));
  assert.ok(wood.skyVisibility < 0.3, 'a boulder in a closed wood no longer glows like one in the open (DEF-10)');
});

test('PR 9 the bounce takes the local ground: snow brighter, moss greener, shaded ground weaker', () => {
  const at = albedo => worldSurfaceAmbientCpu({ validity: 1, canopy: 0, contact: 0, albedo }, GROUND).groundBounce;
  const luma = c => c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;
  const snow = at([0.85, 0.88, 0.92]);
  const sand = at([0.5, 0.42, 0.3]);
  const moss = at([0.06, 0.12, 0.04]);
  assert.ok(luma(snow) > luma(sand) && luma(sand) > luma(moss));
  assert.ok(sand[0] > sand[2] && moss[1] > moss[0], 'each bounce keeps its ground hue');
  const energy = luma(GROUND);
  snow.forEach(c => assert.ok(c <= BOUNCE_ALBEDO_GAIN_MAX * energy + 1e-12, 'snow bounce is capped'));
  const shaded = worldSurfaceAmbientCpu({ validity: 1, canopy: 1, contact: 0, albedo: [0.5, 0.42, 0.3] }, GROUND).groundBounce;
  assert.ok(luma(shaded) < luma(sand), 'ground under a canopy bounces less');
});

test('PR 9 stones and bark read the WSC per vertex in one varying; ambient:false is the old graph', () => {
  const shader = (emission) => {
    const material = new THREE.MeshStandardNodeMaterial();
    material.emissiveNode = emission;
    return buildShader(new THREE.Mesh(new THREE.BoxGeometry(), material));
  };
  const stone = vec3(0.3, 0.3, 0.3);
  const rock = shader(rockShadeEmission(stone));
  assert.match(rock.vertexShader, /rockAmbient/);
  assert.match(rock.vertexShader, /textureLoad/, 'the WSC is read in the vertex stage');
  assert.doesNotMatch(rock.fragmentShader, /textureLoad/, 'no WSC fetch per fragment');
  assert.match(shader(treeBarkEmission(stone)).vertexShader, /barkAmbient/);
  assert.doesNotMatch(shader(rockShadeEmission(stone, { ambient: false })).vertexShader, /rockAmbient/);
});

test('PR 9 cloud turns sun into sky light: the sky fill rises while the total falls', async () => {
  const { overcastSkyLook, resolveSkyLook } = await import('../src/editor/stylized/sky/SkyLook.js');
  const { environmentLightScale } = await import('../src/editor/stylized/sky/sceneEnvironment.js');
  const sky = {
    lowColor: '#9cc9e2', highColor: '#3f83c2', sunColor: '#fff4dc', sunGlowColor: '#ffd7a6',
    cloudCore: '#b8c6d2', cloudEdge: '#f7fbff', cloudRim: '#fff3dc', fogColor: '#9cc9e2',
    groundLightColor: '#6f784d', directionalColor: '#fff3dc', sunElevation: 40, sunAzimuth: 180,
    sunEmission: 1.4, sunGlowIntensity: 0.45, cloudOpacity: 0.62, cloudDensity: 0.56,
    ambientIntensity: 1.3, directionalIntensity: 2.8, cloudShadows: { enabled: true, strength: 0.45 },
  };
  const day = resolveSkyLook(sky, 'configured');
  const covered = overcastSkyLook(day, 1);
  assert.ok(covered.ambientIntensity > day.ambientIntensity, 'the sky fill rises under cover');
  assert.ok(environmentLightScale(covered, day) < 1, 'but the total light still falls');
});
