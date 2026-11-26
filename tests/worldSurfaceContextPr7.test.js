import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three/webgpu';
import { gradeTownMaterial } from '../src/render/materials/townGrade.js';
import { TOWN_GROUND, townSoil } from '../src/render/materials/townGroundContact.js';
import { createPavingMaterial } from '../src/editor/world/settlements/paving/SettlementPavingMaterial.js';
import { settlementPavingJob } from '../src/editor/world/settlements/paving/SettlementPavingGeometry.js';
import { buildShader } from '../test/helpers/buildShader.js';

const luma = c => c[0] * 0.3 + c[1] * 0.55 + c[2] * 0.15;

test('PR 7 soil from terrain albedo: halfway to the town ground in value, earth in hue', () => {
  const ground = luma(TOWN_GROUND);
  for (const albedo of [[0.12, 0.2, 0.06], [0.55, 0.45, 0.3], [0.8, 0.82, 0.86], [0.05, 0.06, 0.04]]) {
    const soil = townSoil(albedo);
    // Halfway (geometric mean) to the town ground's luminance, floored for near-black terrain.
    const expected = luma(albedo) * Math.sqrt(ground / Math.max(luma(albedo), 0.05));
    assert.ok(Math.abs(luma(soil) - expected) < expected * 0.01, `${albedo}: ${luma(soil)} vs ${expected}`);
    // Earth: red over green over blue, whatever the terrain's own hue.
    assert.ok(soil[0] > soil[1] && soil[1] > soil[2], `${albedo} → ${soil}`);
  }
  // A meadow gives a dark rich earth, a desert a pale one.
  assert.ok(luma(townSoil([0.12, 0.2, 0.06])) < luma(TOWN_GROUND));
  assert.ok(luma(townSoil([0.55, 0.45, 0.3])) > luma(townSoil([0.12, 0.2, 0.06])));
});

function vertexBranch(material) {
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(), material, 1);
  mesh.geometry.setAttribute('instanceDither', new THREE.InstancedBufferAttribute(new Float32Array(3), 3));
  return buildShader(mesh).vertexShader;
}

test('PR 7 town walls read the WSC only for vertices near their ground line; roofs never', () => {
  const wall = new THREE.MeshStandardNodeMaterial();
  gradeTownMaterial(wall, 'stone');
  const vs = vertexBranch(wall);
  assert.match(vs, /townFootGround/);
  const branch = vs.indexOf('< 2.5');
  assert.ok(branch > 0, 'foundation sampling is gated on height');
  assert.ok(vs.indexOf('textureLoad') > branch, 'no WSC fetch above the gate');
  const roof = new THREE.MeshStandardNodeMaterial();
  gradeTownMaterial(roof, 'roof');
  assert.doesNotMatch(vertexBranch(roof), /townFootGround/);
});

test('PR 7 earth paving takes the terrain soil; stone paving keeps its tint', () => {
  const tex = () => new THREE.DataTexture(new Uint8Array(4), 1, 1);
  const set = { name: 'fixture', color: tex(), normal: tex(), arm: tex() };
  const shader = layer => {
    const geometry = new THREE.PlaneGeometry();
    geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(12).fill(1), 3));
    geometry.setAttribute('pavingEdge', new THREE.BufferAttribute(new Float32Array(4), 1));
    return buildShader(new THREE.Mesh(geometry, createPavingMaterial(layer, set, 'granite'))).vertexShader;
  };
  assert.match(shader('earth'), /pavingEarthSoil/);
  assert.doesNotMatch(shader('cobble'), /pavingEarthSoil/);
});

test('PR 7 a building apron rim swells organically and never crosses inside the wall', () => {
  const plan = {
    profile: { rank: 1, radius: 40 },
    streets: [],
    buildings: [{ x: 0, z: 0, width: 14, depth: 10, yaw: 0, kind: 'house' }],
  };
  const job = settlementPavingJob(plan, () => 0, { earth: 2, cobble: 2, flagstone: 2 });
  let step = job.next();
  while (!step.done) step = job.next();
  const earth = step.value.find(arrays => arrays.kind === 'earth');
  const margins = [];
  for (let i = 0; i < earth.edges.length; i += 1) {
    if (earth.edges[i] !== 1) continue;
    const x = earth.positions[i * 3];
    const z = -earth.positions[i * 3 + 2];
    margins.push(Math.max(Math.abs(x) - 7, Math.abs(z) - 5));
  }
  assert.ok(margins.length >= 8);
  assert.ok(Math.min(...margins) > 0.5, `rim inside the wall: ${Math.min(...margins)}`);
  assert.ok(Math.max(...margins) - Math.min(...margins) > 0.5, 'rim is a ruled margin');
});
