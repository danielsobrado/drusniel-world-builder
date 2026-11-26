import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import yaml from 'js-yaml';
import * as THREE from 'three/webgpu';
import {
  WSC_CONFORM_MODES,
  resolveContactProfile,
  resolveWorldSurfaceContactConfig,
} from '../src/editor/stylized/worldSurfaceContext/WorldSurfaceContactConfig.js';
import {
  applyGroundContactDeform,
  groundContactDeformOffset,
} from '../src/editor/stylized/worldSurfaceContext/GroundContactDeformer.js';
import { createDitheredMaterial } from '../src/editor/stylized/lod/StylizedDitheredMaterial.js';
import { createStylizedRockMaterial } from '../src/editor/stylized/StylizedRockView.js';
import { resolveRockWeathering } from '../src/editor/stylized/rockWeathering.js';
import { buildShader } from '../test/helpers/buildShader.js';

const rootConfig = yaml.load(readFileSync(new URL('../editor.config.yaml', import.meta.url), 'utf8'));
const stylizedConfig = rootConfig.stylizedSurface;
const contactYaml = yaml.load(readFileSync(new URL('../config/wsc-contact.yaml', import.meta.url), 'utf8'));
const cfg = resolveWorldSurfaceContactConfig(contactYaml);
const conformOf = name => resolveContactProfile(name, cfg).conform;

test('PR 5 conform blocks resolve from YAML, merge over defaults, and reject bad values', () => {
  assert.equal(conformOf('understory').mode, 'hug');
  assert.equal(conformOf('bushProxy').mode, 'hug');
  assert.equal(conformOf('rock').mode, 'settle');
  // Tree root plates stay with the CPU TreeRootFitter.
  for (const name of ['tree', 'alpineRock', 'debris', 'mossMound', 'foundation']) {
    assert.equal(conformOf(name).enabled, false, name);
  }
  for (const c of Object.values(cfg.profiles).map(p => p.conform)) assert.ok(WSC_CONFORM_MODES.includes(c.mode));
  // A partial override keeps the profile's other conform fields.
  const merged = resolveWorldSurfaceContactConfig({ profiles: { rock: { conform: { maxOffsetMeters: 0.1 } } } });
  assert.equal(merged.profiles.rock.conform.maxOffsetMeters, 0.1);
  assert.equal(merged.profiles.rock.conform.mode, 'settle');
  assert.throws(() => resolveWorldSurfaceContactConfig({ profiles: { rock: { conform: { mode: 'skirt' } } } }), RangeError);
  assert.throws(() => resolveWorldSurfaceContactConfig({ profiles: { rock: { conform: { maxOffsetMeters: 0 } } } }), RangeError);
  assert.throws(() => resolveWorldSurfaceContactConfig({ profiles: { rock: { conform: { mode: 'residual' } } } }), RangeError);
  assert.throws(() => resolveWorldSurfaceContactConfig({ profiles: { tree: { conform: 'on' } } }), TypeError);
});

// Root at the origin; heights are terrain heights at the vertex/root.
const offset = (name, args) => groundContactDeformOffset({ conform: conformOf(name), ...args });

test('PR 5 settle leaves a planar slope untouched (the CPU sink and tilt own the plane)', () => {
  const slope = 0.4; // dH/dx
  const normal = [-slope, 1, 0].map(v => v / Math.hypot(slope, 1));
  for (const dx of [-0.9, -0.3, 0.3, 0.9]) {
    const dy = offset('rock', { vertexHeight: 5 + slope * dx, rootHeight: 5, normal, dx, localY: 0 });
    assert.ok(Math.abs(dy) < 1e-9, `dx=${dx} dy=${dy}`);
  }
});

test('PR 5 settle pulls a floating rim onto a convex ridge and never lifts over a hump', () => {
  const ridge = x => 5 - 0.5 * x * x; // terrain falls away from the root on both sides
  // Within maxOffsetMeters (0.3 m) of drop the rim lands exactly on the ground.
  for (const dx of [-0.7, -0.4, 0.4, 0.7]) {
    const planeY = 5; // flat seat at the root; the rim vertex sits on it before the morph
    const dy = offset('rock', { vertexHeight: ridge(dx), rootHeight: ridge(0), dx, localY: 0 });
    const gap = planeY + dy - ridge(dx);
    assert.ok(gap <= 1e-9, `rim floats ${gap} m at dx=${dx}`);
  }
  // A hump under the rim stays embedded: no upward move.
  assert.equal(offset('rock', { vertexHeight: 5.2, rootHeight: 5, dx: 0.5, localY: 0 }), 0);
  // Bounded by maxOffsetMeters even over a deep hollow.
  const deep = offset('rock', { vertexHeight: 3, rootHeight: 5, dx: 0.5, localY: 0 });
  assert.equal(deep, -conformOf('rock').maxOffsetMeters);
});

test('PR 5 morph fades to zero above the band and outside WSC validity', () => {
  const hug = conformOf('understory');
  const height = 1.2;
  const band = Math.max(hug.minBandMeters, height * hug.bandShare);
  const at = localY => offset('understory', { vertexHeight: 5.2, rootHeight: 5, height, localY });
  assert.ok(Math.abs(at(0) - (0.2 - hug.buryMeters)) < 1e-9);
  assert.ok(Math.abs(at(band / 2)) < Math.abs(at(0)));
  assert.equal(at(band), 0);
  assert.equal(at(band * 2), 0);
  assert.equal(offset('understory', { vertexHeight: 5.2, rootHeight: 5, height, localY: 0, validity: 0 }), 0);
  // Disabled profiles return the node untouched.
  const node = { marker: true };
  assert.equal(applyGroundContactDeform(node, { profile: 'debris', config: cfg }), node);
});

function instancedAttributes(geometry, attributes) {
  for (const [name, values] of Object.entries(attributes)) {
    geometry.setAttribute(name, new THREE.InstancedBufferAttribute(new Float32Array(values), values.length));
  }
  return geometry;
}

test('PR 5 boulder settle compiles to WGSL reading the instance root', () => {
  const rockGeo = new THREE.IcosahedronGeometry(1, 1);
  rockGeo.computeBoundingBox();
  const source = new THREE.Mesh(rockGeo, new THREE.MeshStandardMaterial({ color: '#8a8378' }));
  const rock = createStylizedRockMaterial(source, stylizedConfig, {
    settings: resolveRockWeathering(stylizedConfig.rocks.weathering), seaLevel: 0,
  }, rockGeo);
  assert.equal(rock.userData.plantMotionAnchor, true, 'LOD runtime must write the rock root');
  instancedAttributes(rockGeo, {
    instanceDither: [1, 0.4, 1], instanceBiomeLook: [1, 1, 1, 1], instanceSurface: [0, 0, 0], instancePlantRoot: [0, 0, 0],
  });
  const rockShader = buildShader(new THREE.InstancedMesh(rockGeo, createDitheredMaterial(rock), 1));
  assert.match(rockShader.vertexShader, /instancePlantRoot/);
});
