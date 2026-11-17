import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import yaml from 'js-yaml';
import { BIOME_FLORA_CATALOG, createBiomeUnderstoryPrototypes } from '../src/editor/stylized/flora/biomeUnderstoryPrototypes.js';

const EXPECTED_BIOMES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 32];

test('every biome has at least 5 detailed procedural flora, understory, trunk, or glacier meshes', () => {
  const byBiome = new Map(EXPECTED_BIOMES.map((id) => [id, []]));
  for (const entry of BIOME_FLORA_CATALOG) {
    for (const tileId of entry.tileIds) {
      if (!byBiome.has(tileId)) byBiome.set(tileId, []);
      byBiome.get(tileId).push(entry.id);
    }
  }
  for (const tileId of EXPECTED_BIOMES) {
    const entries = byBiome.get(tileId) ?? [];
    assert.ok(entries.length >= 5, `biome ${tileId} expected >= 5 new meshes, got ${entries.length}`);
  }
});

test('all biome flora geometries are valid, finite, richly tessellated, and include attributes', () => {
  const seenIds = new Set();
  for (const entry of BIOME_FLORA_CATALOG) {
    assert.ok(!seenIds.has(entry.id), `duplicate flora id: ${entry.id}`);
    seenIds.add(entry.id);

    const geometry = entry.createGeometry();
    const pos = geometry.getAttribute('position');
    const norm = geometry.getAttribute('normal');
    const uv = geometry.getAttribute('uv');
    const color = geometry.getAttribute('color');
    const index = geometry.getIndex();

    assert.ok(pos && pos.count > 40, `${entry.id} vertex count ${pos?.count}`);
    assert.ok(pos.array.every(Number.isFinite), `${entry.id} has non-finite positions`);
    assert.ok(norm && norm.count === pos.count && norm.array.every(Number.isFinite), `${entry.id} invalid normals`);
    assert.ok(uv && uv.count === pos.count && uv.array.every(Number.isFinite), `${entry.id} invalid UVs`);
    assert.ok(color && color.count === pos.count && color.array.every(Number.isFinite), `${entry.id} invalid colors`);
    assert.ok(index && index.count >= 1050, `${entry.id} expected >= 350 tris, got ${(index?.count ?? 0) / 3}`);
    assert.ok(index.array.every((i) => i < pos.count), `${entry.id} out-of-range index`);
    assert.ok(index.count / 3 <= 2200, `${entry.id} exceeds per-prop detail cap: ${index.count / 3} tris`);
    geometry.dispose();
  }
});

test('createBiomeUnderstoryPrototypes compiles materials with instanceBiomeLook for every entry', async () => {
  const raw = await fs.readFile('editor.config.yaml', 'utf8');
  const parsed = yaml.load(raw);
  const surface = parsed.stylizedSurface ?? {};
  const prototypes = createBiomeUnderstoryPrototypes(surface, {
    soilColor: surface?.trees?.forestFloor?.litterColor,
    floorColor: surface?.trees?.forestFloor?.groundCoreColor,
    barkGrade: surface?.trees?.barkGrade,
    config: surface,
  });
  assert.equal(prototypes.length, BIOME_FLORA_CATALOG.length);
  for (const proto of prototypes) {
    assert.ok(Array.isArray(proto.tileIds) && proto.tileIds.length > 0);
    assert.equal(proto.parts.length, 1);
    assert.equal(proto.parts[0].instanceBiomeLook, true);
    const mat = proto.parts[0].material;
    assert.ok(mat && mat.colorNode && mat.normalNode && mat.roughnessNode, `${proto.id} should wire PBR color/normal/roughness nodes`);
    proto.parts[0].geometry.dispose();
  }
});
