import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three/webgpu';
import { color, float, vec3 } from 'three/tsl';
import { coldStoneSurface } from '../src/editor/stylized/rockSnowSurface.js';
import { snowDeposition } from '../src/editor/stylized/snowDeposition.js';
import { createAlpineRockGeometry } from '../src/editor/stylized/alpine/alpineRockGeometry.js';
import { buildFracturedAlpineRockPrototypes } from '../src/editor/stylized/fracturedRockPrototypes.js';
import { formationStones, DEFAULT_ROCK_FORMATIONS } from '../src/editor/stylized/rockFormations.js';
import { createRockSnowCapGeometry } from '../src/editor/stylized/snow/RockSnowCapGeometry.js';
import { createRockSnowCapMaterial } from '../src/editor/stylized/snow/RockSnowCapMaterial.js';
import { coatCoverageOf } from '../src/editor/stylized/surfaceCoatings/CoatCoverage.js';
import { applyWorldSurfaceContact } from '../src/editor/stylized/worldSurfaceContext/WorldSurfaceContactNodes.js';

test('Phase 1: coldStoneSurface exposes crevice & surface height alongside matte rock PBR', () => {
  const surface = coldStoneSurface({
    point: vec3(2, 1, -3),
    normal: vec3(0.4, 0.8, 0.44),
    baseNormal: vec3(0, 0, 1),
    tint: color('#a4b0be'),
  });
  assert.ok(surface.color && surface.roughness && surface.normal && surface.perturbedUp);
  assert.ok(surface.crevice, 'exposes fracture crevice mask for crack snow fill');
  assert.ok(surface.height, 'exposes surface height for height-blended snow edges');
});

test('Phase 2: procedural fractured alpine prototypes & formation scree build clean geometry', () => {
  const prototypes = buildFracturedAlpineRockPrototypes();
  assert.equal(prototypes.length, 4);
  for (const proto of prototypes) {
    const pos = proto.geometry.getAttribute('position');
    const norm = proto.geometry.getAttribute('normal');
    assert.ok(pos.count > 100, `${proto.id} near geometry has rich fractured detail`);
    assert.ok(norm && norm.count === pos.count, `${proto.id} has smooth vertex normals`);
    assert.equal(proto.geometry.getAttribute('uv'), undefined, `${proto.id} omits unused UVs to save vertex buffers`);
    assert.ok(Math.abs(proto.geometry.boundingBox.min.y) < 1e-3, `${proto.id} is ground-pivoted at y=0`);
    assert.ok(proto.proxyGeometry.getAttribute('position').count < pos.count, `${proto.id} proxy is lighter`);
    proto.geometry.dispose();
    proto.proxyGeometry.dispose();
  }

  const crag = createAlpineRockGeometry(0, false);
  assert.ok(crag.getAttribute('position').count > 400);
  crag.dispose();

  const formation = formationStones(3, -5, DEFAULT_ROCK_FORMATIONS, () => 1);
  assert.ok(formation);
  const scree = formation.stones.filter((s) => s.identity.includes(':s'));
  assert.ok(scree.length >= DEFAULT_ROCK_FORMATIONS.screeMinStones, 'scatters fragmented scree around formation');
  for (const fragment of scree) {
    assert.ok(fragment.scale >= DEFAULT_ROCK_FORMATIONS.screeMinScale && fragment.scale <= DEFAULT_ROCK_FORMATIONS.screeMaxScale);
  }
});

test('Phase 3: snowDeposition accepts crevice & surfaceHeight and outputs thickness', () => {
  const dep = snowDeposition({
    snow: float(0.95),
    breakup: float(0.1),
    ledgeBoost: float(0.2),
    crevice: float(0.8),
    surfaceHeight: float(0.3),
    centre: [0, 0.5, 0],
    groundY: 0.1,
    height: 1.4,
  });
  assert.ok(dep.cover && dep.skirt && dep.cap && dep.apron && dep.thickness);
});

test('Phase 4: volumetric snow cap + basal snowbank geometry & material stay within WebGPU vertex buffer budget', () => {
  const [proto] = buildFracturedAlpineRockPrototypes();
  const capGeom = createRockSnowCapGeometry(proto.geometry, { groundY: 0.25 });
  assert.ok(capGeom, 'builds volumetric snow cap + basal snowbank');
  const attrs = Object.keys(capGeom.attributes);
  assert.deepEqual(attrs.sort(), ['normal', 'position', 'uv'], 'keeps geometry to 3 attributes');
  const uv = capGeom.getAttribute('uv');
  let hasUpperCap = false;
  let hasBasalBank = false;
  for (let i = 0; i < uv.count; i += 1) {
    if (uv.getY(i) < 0.5) hasUpperCap = true;
    else hasBasalBank = true;
  }
  assert.ok(hasUpperCap, 'includes upper volumetric snow cap vertices');
  assert.ok(hasBasalBank, 'includes basal snowbank drift skirt vertices');

  const matBiome = createRockSnowCapMaterial({ snowSource: 'biomeLook' });
  const matAlpine = createRockSnowCapMaterial({ snowSource: 'instanceSnow' });
  assert.ok(matBiome.positionNode && matBiome.colorNode && matBiome.normalNode);
  assert.ok(coatCoverageOf(matBiome).snow, 'publishes snow coverage for D23 diagnostic');
  assert.ok(coatCoverageOf(matAlpine).snow, 'publishes snow coverage on alpine cap material');

  proto.geometry.dispose();
  proto.proxyGeometry.dispose();
  capGeom.dispose();
  matBiome.dispose();
  matAlpine.dispose();
});

test('Phase 5: applyWorldSurfaceContact allows decoupled aoMask while zeroing soil collar on snow', () => {
  const wsc = {
    height: float(0),
    normal: vec3(0, 1, 0),
    validity: float(1),
    albedo: vec3(0.9, 0.92, 0.96),
    roughness: float(0.85),
    contact: float(0.8),
  };
  const result = applyWorldSurfaceContact({
    surface: { color: vec3(0.4, 0.42, 0.45), roughness: float(0.9), normal: vec3(0, 0, 1) },
    wsc,
    profile: 'rock',
    worldY: float(0.1),
    mask: float(0),
    aoMask: float(1),
  });
  assert.ok(result.color && result.contactAo);
});
