import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three/webgpu';
import { float, vec3 } from 'three/tsl';
import {
  decodeTreeShape, encodeTreeShape, packTreeTrunk, unpackTreeTrunk,
} from '../src/editor/stylized/forest/treeShapeCode.js';
import { shapeTreePosition, tagCrownBand, treeShapeNodes } from '../src/editor/stylized/forest/treeCrownShape.js';
import { FOREST_AGE_CLASSES, ForestSpeciesRegistry } from '../src/editor/stylized/forest/ForestSpeciesRegistry.js';
import { treeMorphology } from '../src/editor/stylized/forest/TreeAppearance.js';
import { createDitheredMaterial } from '../src/editor/stylized/lod/StylizedDitheredMaterial.js';
import { evaluateShaderNode as evaluate } from '../test/helpers/evaluateShaderNode.js';
import { buildShader } from '../test/helpers/buildShader.js';

const close = (actual, expected, tolerance = 1e-6) => assert.ok(Math.abs(actual - expected) < tolerance,
  `${actual} is not ${expected}`);

test('the shape code round-trips every field, clamps, and code 0 is the plain prototype', () => {
  assert.deepEqual(decodeTreeShape(0), { asymmetry: 0, taper: 0, bole: 0, flare: 0 });
  const shape = decodeTreeShape(encodeTreeShape({ asymmetry: 0.26, taper: -0.3, bole: 0.45, flare: 0.3 }));
  close(shape.asymmetry, 0.45 * 4 / 7);
  close(shape.taper, -0.3);
  close(shape.bole, 0.45);
  close(shape.flare, 0.3);
  const clamped = decodeTreeShape(encodeTreeShape({ asymmetry: 9, taper: 9, bole: -9, flare: -1 }));
  close(clamped.asymmetry, 0.45);
  close(clamped.taper, 0.3);
  close(clamped.bole, -0.6);
  close(clamped.flare, 0);
});

test('a packed trunk survives float32 at the largest code, and the shader decode agrees', () => {
  for (const code of [0, 1, 777, 2047]) {
    const stored = new Float32Array([packTreeTrunk(1.2345, code)])[0];
    const { trunkScale, code: decoded } = unpackTreeTrunk(stored);
    assert.equal(decoded, code);
    close(trunkScale, 1.2345, 1e-3);
    const nodes = treeShapeNodes(float(stored));
    close(evaluate(nodes.trunk), trunkScale);
    for (const [name, value] of Object.entries(decodeTreeShape(code))) close(evaluate(nodes[name]), value);
  }
});

const BAND = [5, 11];
const place = (position, morphology, kind = 'leaf') => evaluate(shapeTreePosition(vec3(...position), {
  kind, center: { x: 0, z: 0 }, band: BAND, morphology: vec3(...morphology), seed: float(0),
}));
// seed 0 puts the light side on +x.

test('an unshaped tree keeps every vertex where its prototype has it', () => {
  for (const position of [[2, 6, -1], [0.3, 0, 0.2], [-3, 10, 2]]) {
    for (const kind of ['leaf', 'trunk']) {
      place(position, [1, 1, 1], kind).forEach((value, i) => close(value, position[i]));
    }
  }
});

test('a crown stretches down from its fixed top and never leaves the trunk axis', () => {
  close(place([0, 11, 0], [1, 1.3, 1])[1], 11);
  close(place([0, 5, 0], [1, 1.3, 1])[1], 11 - 6 * 1.3);
  const lopsided = packTreeTrunk(1, encodeTreeShape({ asymmetry: 0.45 }));
  // At the crown base the shear is zero: the light side reaches further, the dark side stays.
  close(place([2, 5, 0], [1, 1, lopsided])[0], 2 * 1.45);
  close(place([-2, 5, 0], [1, 1, lopsided])[0], -2);
  // The axis only shears toward the light as the crown rises.
  const top = place([0, 11, 0], [1, 1, lopsided]);
  assert.ok(top[0] > 0 && top[0] < 0.25 * 6 * 0.45 + 1e-6);
});

test('taper widens one end of the crown, and branches inside the crown follow their leaves', () => {
  const conical = packTreeTrunk(1, encodeTreeShape({ taper: 0.3 }));
  close(place([2, 5, 0], [1, 1, conical])[0], 2.6);
  close(place([2, 11, 0], [1, 1, conical])[0], 1.4);
  const shaped = packTreeTrunk(1.1, encodeTreeShape({ taper: -0.2, asymmetry: 0.3, bole: 0.3 }));
  for (const position of [[1.5, 8, 0.5], [-1, 10, 2]]) {
    const leaf = place(position, [1.1, 1, shaped], 'leaf');
    const branch = place(position, [9, 9, shaped], 'trunk');
    leaf.forEach((value, i) => i !== 1 && close(branch[i], value));
  }
});

test('the bole thickens toward the root collar and leaves the crown band to the crown', () => {
  const stout = packTreeTrunk(1, encodeTreeShape({ bole: 0.45, flare: 0.45 }));
  close(place([0.3, 0, 0], [1, 1, stout], 'trunk')[0], 0.3 * 1.9);
  const midBole = place([0.3, 2.5, 0], [1, 1, stout], 'trunk')[0];
  assert.ok(midBole > 0.3 && midBole < 0.3 * 1.45);
  close(place([0.3, 8, 0], [1, 1, stout], 'trunk')[0], 0.3);
  place([0, 0, 0], [1, 1, stout], 'trunk').forEach(value => close(value, 0));
});

test('one prototype shares one crown band, and a leafless snag uses its upper stem', () => {
  const part = (kind, height, base = 0) => {
    const geometry = new THREE.BoxGeometry(1, height, 1);
    geometry.translate(0, base + height / 2, 0);
    return { kind, geometry, material: new THREE.MeshLambertNodeMaterial() };
  };
  const tree = tagCrownBand([part('trunk', 10), part('leaf', 4, 5), part('leaf', 3, 8)]);
  for (const { material } of tree) assert.deepEqual(material.userData.treeCrownBand, [5, 11]);
  const snag = tagCrownBand([part('trunk', 10)]);
  assert.deepEqual(snag[0].material.userData.treeCrownBand, [6, 10]);
});

test('shaped leaf and trunk materials compile', () => {
  const geometry = new THREE.CylinderGeometry(0.5, 0.8, 10, 8, 4);
  for (const [name, values] of Object.entries({ instanceDither: [1, 0.5, 1],
    instanceMorphology: [1, 1, packTreeTrunk(1, 1234)], instanceRootPlane: [0, 0, 1], instanceLeafTint: [1, 1, 1, 0] })) {
    geometry.setAttribute(name, new THREE.InstancedBufferAttribute(new Float32Array(values), values.length));
  }
  for (const kind of ['leaf', 'trunk']) {
    const source = new THREE.MeshLambertNodeMaterial();
    source.userData.treeCrownBand = [4, 10];
    const material = createDitheredMaterial(source, { kind, tinted: kind === 'leaf',
      morphologyPivot: { x: 0, y: 4, z: 0 } });
    assert.deepEqual(material.userData.treeCrownBand, [4, 10]);
    assert.match(buildShader(new THREE.InstancedMesh(geometry, material, 1)).vertexShader, /floor/);
  }
});

const CORE = Object.freeze({ profileKey: 'temperate_deciduous_forest', patchId: 'grove', patchEdge: 0,
  patchCoverage: 1, rawPatchCoverage: 1, slope: 0, waterWeight: 0, riparian: 0, tileId: null });

function proportions(ageClass, count = 160) {
  const registry = new ForestSpeciesRegistry({ prototypeCount: 1 });
  const total = { width: 0, trunk: 0, base: 0 };
  for (let i = 0; i < count; i += 1) {
    const tree = registry.select({ stableId: `tree:${i}`, scale: 1, ageClass, speciesId: 'broadleaf_round' }, CORE);
    const shape = decodeTreeShape(tree.shapeCode);
    // The instance matrix scales the whole tree by its height, so the morphology
    // terms are already widths per unit height.
    total.width += treeMorphology(tree)[0];
    total.trunk += tree.trunkScale * (1 + shape.bole);
    total.base += tree.trunkBaseScale / tree.trunkScale;
  }
  return Object.fromEntries(Object.entries(total).map(([key, value]) => [key, value / count]));
}

test('age changes proportions: slender saplings, stout broad ancients', () => {
  const [sapling, young, mature, ancient] = ['sapling', 'young', 'mature', 'ancient'].map((age) => proportions(age));
  assert.ok(sapling.width < young.width && young.width < mature.width && mature.width < ancient.width,
    'crown width per unit height grows with age');
  assert.ok(sapling.trunk < young.trunk && young.trunk < mature.trunk && mature.trunk < ancient.trunk,
    'trunk girth per unit height grows with age');
  assert.ok(ancient.trunk > mature.trunk * 1.35, 'an ancient bole is clearly stouter');
  assert.ok(ancient.base > mature.base && mature.base > sapling.base, 'old trees flare at the root');
  assert.ok(FOREST_AGE_CLASSES.sapling.crownHeight > FOREST_AGE_CLASSES.mature.crownHeight);
  assert.equal(FOREST_AGE_CLASSES.ancient.crownHeight, 1);
});

test('a stand of one species shows several crown families, and edge trees reach for the light', () => {
  const registry = new ForestSpeciesRegistry({ prototypeCount: 1 });
  const select = (i, speciesId, habitat = CORE) => registry.select({
    stableId: `tree:${i}`, scale: 1, ageClass: 'mature', speciesId }, habitat);
  const broadleaf = new Set();
  const conifer = new Set();
  let core = 0;
  let edge = 0;
  for (let i = 0; i < 120; i += 1) {
    broadleaf.add(select(i, 'broadleaf_round').crownForm);
    conifer.add(select(i, 'conifer_narrow').crownForm);
    core += decodeTreeShape(select(i, 'broadleaf_round').shapeCode).asymmetry;
    edge += decodeTreeShape(select(i, 'broadleaf_round', { ...CORE, patchEdge: 1 }).shapeCode).asymmetry;
  }
  assert.equal(broadleaf.size, 6);
  assert.deepEqual([...conifer].sort(), ['columnar', 'full', 'spire', 'standard']);
  assert.ok(edge > core * 2, `edge ${edge} vs core ${core}`);
});
