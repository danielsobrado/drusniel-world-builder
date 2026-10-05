import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import * as THREE from 'three';
import { createGodsEndAquaticGeometry } from '../src/editor/assets/godsEnd/aquatic/aquaticGeometry.js';
import { AQUATIC_FLORA_KINDS, createAquaticFloraPrototypes } from '../src/editor/stylized/aquaticFloraPrototypes.js';
import { UnderwaterOpticsState } from '../src/editor/water/UnderwaterOpticsState.js';
import { resolveUnderwaterOpticsConfig } from '../src/editor/water/UnderwaterOpticsConfig.js';
import { WATER_KIND_LAKE, WATER_KIND_OCEAN } from '../src/editor/water/WaterConstants.js';
import { UNDERWATER_RIPPLE_WAVES } from '../src/editor/water/GodsEndWaterPatterns.js';
import catalog from '../src/editor/assets/godsEnd/catalog.generated.json' with { type: 'json' };
import { createGodsEndObjectCatalog } from '../src/editor/assets/godsEnd/objectCatalog.js';
import { TILE_BY_KEY } from '../src/editor/tileCatalog.js';
import { ObjectMap } from '../src/editor/ObjectMap.js';
import { ObjectPlacementResolver } from '../src/editor/placement/ObjectPlacementResolver.js';
import { createSeabedRockGeometry } from '../src/editor/assets/godsEnd/seabed/seabedGeometry.js';
import { UnderwaterCausticsPostProcess } from '../src/editor/water/UnderwaterCausticsPostProcess.js';

const fixture = JSON.parse(await readFile(new URL('./fixtures/gods-end/aquatic-recipes.json', import.meta.url)));
const boulders = JSON.parse(await readFile(new URL('./fixtures/gods-end/seabed-recipes.json', import.meta.url)));

test('three seabed boulder recipes retain source vertices, normals and topology at both LODs', () => {
  for (let variant = 0; variant < 3; variant++) for (const lod of ['near', 'far']) {
    const geometry = createSeabedRockGeometry(variant, lod);
    const hash = createHash('sha256');
    for (const array of [geometry.attributes.position.array, geometry.attributes.normal.array, geometry.index.array]) {
      hash.update(Buffer.from(array.buffer));
    }
    assert.deepEqual({ vertices: geometry.attributes.position.count, sha256: hash.digest('hex') }, boulders[`${variant}:${lod}`]);
    geometry.dispose();
  }
});

test('eight aquatic species retain the donor vertices, normals and colours at both LODs', () => {
  for (const kind of AQUATIC_FLORA_KINDS) for (const lod of ['near', 'far']) {
    const geometry = createGodsEndAquaticGeometry(kind, { lod });
    const hash = createHash('sha256');
    for (const name of ['position', 'normal', 'color']) {
      hash.update(Buffer.from(geometry.attributes[name].array.buffer));
    }
    assert.deepEqual({ vertices: geometry.attributes.position.count, sha256: hash.digest('hex') }, fixture[`${kind}:${lod}`]);
    geometry.dispose();
  }
});

test('rooted aquatic species stay beneath water and pads sit above its surface', () => {
  const definitions = createAquaticFloraPrototypes({ maxScale: 1.3, proceduralVariants: Object.fromEntries(AQUATIC_FLORA_KINDS.map(kind => [kind, { kind }])) });
  assert.equal(definitions.length, 8);
  for (const definition of definitions) {
    const { geometry, material } = definition.parts[0];
    geometry.computeBoundingBox();
    assert.equal(material.vertexColors, true);
    if (definition.water.placement === 'rooted') {
      assert.ok(geometry.boundingBox.max.y * 1.3 < definition.water.minimumDepth, definition.id);
    } else {
      assert.ok(definition.heightOffset > 0);
      assert.equal(material.transparent, true);
    }
    geometry.dispose();
    material.dispose();
  }
});

test('underwater colour dims with depth and remains specific to the sampled body', () => {
  const state = new UnderwaterOpticsState({ settings: {}, scene: new THREE.Scene() });
  const camera = new THREE.PerspectiveCamera(65, 1, 0.1, 1000);
  camera.position.y = -5;
  camera.updateMatrixWorld();
  state.update({ waterKind: WATER_KIND_OCEAN });
  state.updateCamera(camera, 0);
  assert.equal(state.depth.value, 5);
  assert.ok(state.color.value.x / 0.03 < state.color.value.z / 0.32, 'red attenuates more quickly');
  const sea = state.color.value.clone();
  state.update({ waterKind: WATER_KIND_LAKE });
  state.updateCamera(camera, 0);
  assert.notDeepEqual(state.color.value, sea);
  camera.position.y = -10;
  camera.updateMatrixWorld();
  const shallow = state.color.value.clone();
  state.updateCamera(camera, 0);
  assert.ok(state.color.value.x < shallow.x && state.color.value.y < shallow.y && state.color.value.z < shallow.z);
});

test('caustics and all six surface ripple phases remain continuous across large rebases', () => {
  let origin = { x: 2_000_000.125, z: -3_000_000.25 };
  const state = new UnderwaterOpticsState({ settings: {}, scene: new THREE.Scene(), floatingOrigin: { getState: () => origin } });
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(15.25, -3, -6.125);
  camera.updateMatrixWorld();
  state.updateCamera(camera, 0);
  const tau = Math.PI * 2;
  const waveValues = () => UNDERWATER_RIPPLE_WAVES.map(([x, z], i) => Math.sin(state.ripplePhases[i].value + state.eye.value.x * x + state.eye.value.z * z));
  const before = waveValues();
  const pattern = () => [state.eye.value.x + state.causticOffset.value.x, state.eye.value.z + state.causticOffset.value.y].map(value => Math.sin(value * tau / 5.5));
  const caustics = pattern();
  origin = { x: origin.x + 1024, z: origin.z - 2048 };
  camera.position.x -= 1024;
  camera.position.z += 2048;
  camera.updateMatrixWorld();
  state.updateCamera(camera, 0);
  waveValues().forEach((value, i) => assert.ok(Math.abs(value - before[i]) < 1e-8));
  pattern().forEach((value, i) => assert.ok(Math.abs(value - caustics[i]) < 1e-8));
});

test('underwater optical coefficients reject non-finite and invalid physical ranges', () => {
  for (const config of [{ extinction: [0.1, NaN, 0.1] }, { dimming: [-1, 0, 0] }, { causticTileMeters: 0 }, { surfaceMirror: 2 }]) {
    assert.throws(() => resolveUnderwaterOpticsConfig(config));
  }
});

test('a disabled underwater postprocess keeps the ordinary fog fallback', () => {
  const postprocess = new UnderwaterCausticsPostProcess({ scene: new THREE.Scene(), renderer: {},
    optics: { enabled: true }, config: { enabled: false, color: '#b9f4e5', intensity: 1,
      scale: 0.42, speed: 0.55, contrast: 2.6, depthFadeStart: 0.15, depthFadeEnd: 6, maxDistance: 45 } });
  assert.equal(postprocess.opticsState, null);
  assert.equal(postprocess.render(new THREE.PerspectiveCamera()), false);
  postprocess.dispose();
});

test('saved aquatic catalog placements retain bed/surface anchors after origin shifts and reject unsuitable water', () => {
  const tileSize = 2;
  const definitions = createGodsEndObjectCatalog(catalog.objects.filter(entry => entry.water), TILE_BY_KEY, tileSize);
  const tileMap = { tileSize, inBounds: () => true, indexOf: (x, z) => `${x}:${z}`, get: () => 0 };
  const before = new ObjectMap({ tileMap, objectCatalog: definitions });
  for (const species of ['eelgrass', 'floweringLilyPad']) {
    before.place({ definitionKey: definitions.find(definition => definition.asset.species === species).key,
      x: 12, z: species === 'eelgrass' ? -8 : -12, rotation: 2 });
  }
  const restored = new ObjectMap({ tileMap, objectCatalog: definitions });
  restored.replaceAll(JSON.parse(JSON.stringify(before.list())));
  assert.deepEqual(restored.list(), before.list());
  let water = { kind: WATER_KIND_LAKE, coverage: 1, depth: 5, surfaceHeight: 0,
    bedHeight: -5, shoreDistance: 4, flowX: 0, flowZ: 0 };
  let origin = { x: 0, z: 0 };
  const sampled = [];
  const resolver = new ObjectPlacementResolver({ objectMap: restored, definitionByKey: restored.definitionByKey,
    heightField: { getVertex: () => -5, sample: () => -5 }, tileSize,
    floatingOrigin: { toRender: (x, z) => ({ x: x - origin.x, z: z - origin.z }) },
    getWaterSample: (x, z) => { sampled.push({ x, z }); return water; } });
  for (const object of restored.list()) {
    const evaluated = resolver.resolve(object);
    assert.equal(evaluated.valid, true);
    const expectedHeight = evaluated.definition.water.placement === 'rooted' ? -5.02 : 0.06;
    assert.equal(evaluated.surface.baseHeight, expectedHeight);
    const canonical = resolver.createCanonicalObjectMatrix(object);
    origin = { x: 4096, z: -8192 };
    const render = resolver.createObjectMatrix(object);
    assert.equal(render.elements[12] + origin.x, canonical.elements[12]);
    assert.equal(render.elements[14] + origin.z, canonical.elements[14]);
    assert.equal(render.elements[13], expectedHeight);
  }
  // Water queries remain in canonical metres, independent of render rebasing.
  assert.ok(sampled.every(({ x, z }) => Math.abs(x) < 100 && Math.abs(z) < 100));
  const rooted = restored.list()[0];
  for (const unsuitable of [null, { ...water, depth: 0.1 }, { ...water, kind: WATER_KIND_OCEAN }, { ...water, coverage: 0.1 }]) {
    water = unsuitable;
    assert.equal(resolver.resolve(rooted).valid, false);
  }
  resolver.dispose();
});
