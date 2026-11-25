import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import yaml from 'js-yaml';
import * as THREE from 'three/webgpu';
import {
  WSC_DEFAULT_DIAGNOSTIC_MODE,
  WSC_DIAGNOSTIC_MODES,
  WSC_MATERIAL_FAMILIES,
  classifySceneMesh,
  resolveWscDiagnosticMode,
} from '../src/editor/performance/qa/wscDiagnosticModes.js';
import {
  WSC_FIXTURE,
  WSC_FIXTURE_CAMERAS,
  createWscFixtureDocument,
} from '../src/editor/performance/qa/WorldVisualWscFixture.js';
import { GroundContactField } from '../src/editor/stylized/groundContact/GroundContactField.js';
import {
  clearGroundContactField,
  groundContactSoilTexture,
  groundContactUniforms,
} from '../src/editor/stylized/groundContact/GroundContactState.js';

test('diagnostic modes default to D00 (disabled) and match config/wsc-diagnostics.yaml', () => {
  assert.equal(WSC_DEFAULT_DIAGNOSTIC_MODE, 'D00');
  assert.equal(resolveWscDiagnosticMode().id, 'D00');
  assert.equal(resolveWscDiagnosticMode(null).id, 'D00');
  assert.equal(resolveWscDiagnosticMode(false).id, 'D00');
  assert.equal(resolveWscDiagnosticMode('albedo').id, 'D01');
  assert.equal(resolveWscDiagnosticMode('d15').id, 'D15');
  assert.throws(() => resolveWscDiagnosticMode('D99'), /Unknown WSC diagnostic mode/);

  const doc = yaml.load(readFileSync(new URL('../config/wsc-diagnostics.yaml', import.meta.url), 'utf8'));
  assert.equal(doc.defaultMode, 'D00');
  for (const id of Object.keys(WSC_DIAGNOSTIC_MODES)) {
    assert.ok(doc.modes[id], `YAML missing diagnostic mode ${id}`);
    assert.ok(typeof doc.modes[id].legend === 'string' && doc.modes[id].legend.length > 5);
  }
});

test('D24 material family palette colors are pairwise distinct for pixel segmentation', () => {
  const entries = Object.values(WSC_MATERIAL_FAMILIES);
  for (let i = 0; i < entries.length; i += 1) {
    for (let j = i + 1; j < entries.length; j += 1) {
      const a = entries[i].rgb;
      const b = entries[j].rgb;
      const dist = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
      assert.ok(dist >= 40, `families ${entries[i].id} and ${entries[j].id} too close (${dist.toFixed(1)})`);
    }
  }
});

test('classifySceneMesh categorizes all major scene families and LOD representations', () => {
  const makeMesh = (parentName, meshName, matName, userData = {}, geomData = {}) => {
    const group = new THREE.Group();
    group.name = parentName;
    const geom = new THREE.BufferGeometry();
    Object.assign(geom.userData, geomData);
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.name = matName;
    Object.assign(mat.userData, userData);
    const mesh = new THREE.Mesh(geom, mat);
    mesh.name = meshName;
    group.add(mesh);
    return { mesh, mat };
  };

  assert.deepEqual(
    classifySceneMesh(...Object.values(makeMesh('world', 'terrain-chunk-0:0', 'terrain'))),
    { family: 'terrain', lod: 'terrain' },
  );
  assert.deepEqual(
    classifySceneMesh(...Object.values(makeMesh('meadow', 'blades', 'meadow-grass-blades'))),
    { family: 'nearGrass', lod: 'nearGrass' },
  );
  assert.deepEqual(
    classifySceneMesh(...Object.values(makeMesh('meadow', 'cards', 'meadow-grass-cards'))),
    { family: 'farGrassCards', lod: 'farGrassCards' },
  );
  assert.deepEqual(
    classifySceneMesh(...Object.values(makeMesh('stylized-trees', 'trunk', 'oak-bark', { barkLighting: true }))),
    { family: 'treeBark', lod: 'treeNear' },
  );
  assert.deepEqual(
    classifySceneMesh(...Object.values(makeMesh('stylized-trees', 'tree-impostor-0', 'impostor'))),
    { family: 'treeImpostor', lod: 'treeImpostor' },
  );
  assert.deepEqual(
    classifySceneMesh(...Object.values(makeMesh('stylized-bushes', 'bush-proxy', 'proxy', {}, { proxyKind: 'clustered-low-poly-canopy' }))),
    { family: 'shrubProxy', lod: 'bushProxy' },
  );
  assert.deepEqual(
    classifySceneMesh(...Object.values(makeMesh('settlement-paving', 'settlement-paving-cobble', 'settlement-paving-cobble-0'))),
    { family: 'paving', lod: 'buildingNear' },
  );
});

test('standardized WSC fixture document is deterministic and spans all 5 substrates', () => {
  const baseDoc = { world: { chunkSize: 64, tileSize: 2, seed: 918273 } };
  const docA = createWscFixtureDocument(baseDoc);
  const docB = createWscFixtureDocument(baseDoc);
  assert.deepEqual(docA, docB, 'fixture document generation must be deterministic');
  const tileIds = new Set();
  for (const chunk of docA.chunks) {
    for (const [, tileId] of chunk.tiles) tileIds.add(tileId);
  }
  for (const expected of [1, 4, 8, 10, 13]) {
    assert.ok(tileIds.has(expected), `fixture missing substrate tile ${expected}`);
  }
  assert.ok(docA.objects.length >= 16);
  assert.equal(WSC_FIXTURE_CAMERAS.overview.x, WSC_FIXTURE.centerX - 24);
});

test('PR 0 cameras.yaml validates all 18 required locations B01-B18 and frozen world metadata', () => {
  const doc = yaml.load(readFileSync(new URL('../docs/qa/world-surface-context/pr-00/cameras.yaml', import.meta.url), 'utf8'));
  assert.equal(doc.viewport.width, 1920);
  assert.equal(doc.viewport.height, 1080);
  const checkPose = (label, cam) => {
    if (cam.mode === 'player') {
      assert.equal(cam.heightAboveGround, 1.7, `${label}: player mode requires heightAboveGround === 1.7`);
    }
  };
  for (let i = 1; i <= 18; i += 1) {
    const id = `B${String(i).padStart(2, '0')}`;
    assert.ok(doc.locations[id], `cameras.yaml missing required location ${id}`);
    const cams = Object.entries(doc.locations[id].cameras);
    assert.ok(cams.length >= 1);
    for (const [camId, cam] of cams) checkPose(`${id}.${camId}`, cam);
  }
  for (const [camId, cam] of Object.entries(WSC_FIXTURE_CAMERAS)) {
    checkPose(`FIXTURE.${camId}`, cam);
  }
});

test('baseline GroundContactField coordinate conversion, floating-origin shift, and missing-slot behavior', () => {
  clearGroundContactField();
  const chunkSize = 8;
  const tileSize = 2;
  const heights = new Float32Array((chunkSize + 1) * (chunkSize + 1)).fill(15);
  const tiles = new Uint8Array(chunkSize * chunkSize).fill(8);
  const slot = {
    descriptor: { key: '0:0', chunkX: 0, chunkZ: 0, originCellX: 0, originCellZ: 0 },
    page: { heights, tiles },
    pageRevision: 1,
    loading: false,
  };
  const field = new GroundContactField({
    terrainView: { worldStore: { chunkSize, tileSize }, slots: [slot] },
    config: {},
    resolution: 128,
    span: 128,
  });

  // Update at origin (0, 0), then rebase origin to (-4096, 4096): canonical stays invariant, renderOrigin shifts exactly.
  assert.equal(field.update({ x: 8, z: -8 }, { x: 0, z: 0 }), true);
  const canonBefore = [groundContactUniforms.canonicalOrigin.value.x, groundContactUniforms.canonicalOrigin.value.y];
  assert.equal(field.update({ x: 8, z: -8 }, { x: -4096, z: 4096 }), true);
  assert.deepEqual(
    [groundContactUniforms.canonicalOrigin.value.x, groundContactUniforms.canonicalOrigin.value.y],
    canonBefore,
    'canonicalOrigin must remain invariant under floating-origin rebase',
  );
  assert.equal(groundContactUniforms.renderOrigin.value.x, canonBefore[0] - (-4096));
  assert.equal(groundContactUniforms.renderOrigin.value.y, canonBefore[1] - 4096);

  // Confirm documented PR 0 baseline defect: globally active field writes fallback (128, 110, 85, 0) for unloaded slots.
  const soil = groundContactSoilTexture.image.data;
  assert.equal(soil[0], 128);
  assert.equal(soil[1], 110);
  assert.equal(soil[2], 85);
  assert.equal(soil[3], 0);
  field.dispose();
  assert.equal(groundContactUniforms.active.value, 0);
});
