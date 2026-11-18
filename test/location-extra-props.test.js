import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { inspectGlbJson, readGlbJson } from '../scripts/lib/glb-inspection.mjs';
import * as frostgardHoldExtra from '../src/editor/locations/generators/frostgardHoldExtraProps.js';
import * as glacierExtra from '../src/editor/locations/generators/glacierExtraProps.js';
import * as glacierFrontExtra from '../src/editor/locations/generators/glacierFrontExtraProps.js';
import * as mineExtra from '../src/editor/locations/generators/mineExtraProps.js';
import * as stoneholdExtra from '../src/editor/locations/generators/stoneholdExtraProps.js';
import * as umbraExtra from '../src/editor/locations/generators/umbraExtraProps.js';

const AREAS = Object.freeze({
  mine: mineExtra,
  umbraCavern: umbraExtra,
  stoneholdHold: stoneholdExtra,
  frostgardGlacierCave: glacierExtra,
  frostgardGlacierFront: glacierFrontExtra,
  frostgardHold: frostgardHoldExtra,
});

function mockBuilder() {
  const props = [];
  const lights = [];
  const flames = [];
  const blocks = [];
  return {
    props,
    lights,
    flames,
    blocks,
    prop(material, geometry, tint = 0xffffff) {
      assert.ok(typeof material === 'string' && material.length > 0);
      assert.ok(geometry, `geometry missing for ${material}`);
      const geoms = Array.isArray(geometry) ? geometry : [geometry];
      let triSum = 0;
      for (const g of geoms) {
        const pos = g.getAttribute('position');
        assert.ok(pos && pos.count > 0 && pos.array.every(Number.isFinite));
        const tris = g.index ? g.index.count / 3 : pos.count / 3;
        triSum += tris;
      }
      props.push({ material, tint, triangles: triSum });
    },
    light(at, tint, intensity, range) { lights.push({ at, tint, intensity, range }); },
    flame(at, opts) { flames.push({ at, ...opts }); },
    nav: { block(at, radius, height) { blocks.push({ at, radius, height }); } },
  };
}

test('every underground and glacier area exports at least 5 multi-part detailed >=15k-tri prop builders', async () => {
  for (const [areaName, mod] of Object.entries(AREAS)) {
    const builders = Object.entries(mod).filter(([, v]) => typeof v === 'function');
    assert.ok(builders.length >= 5, `${areaName} expected >= 5 prop builders, got ${builders.length}`);
    for (const [fnName, fn] of builders) {
      const b = mockBuilder();
      fn(b, { x: 0, y: 0, z: 0 }, 0.5);
      assert.ok(b.props.length >= 3, `${areaName}.${fnName} should emit multi-part detailed geometry (got ${b.props.length} parts)`);
      const totalTris = b.props.reduce((s, p) => s + p.triangles, 0);
      assert.ok(totalTris >= 15000, `${areaName}.${fnName} expected >= 15000 tris, got ${totalTris}`);
    }
  }
  const manifest = JSON.parse(await fs.readFile('assets/runtime-sources/underground/manifest.json', 'utf8'));
  const areas = Object.entries(manifest.areas ?? {});
  assert.equal(areas.length, 6, 'expected 6 underground & glacier areas in manifest');
  for (const [area, items] of areas) {
    assert.ok(items.length >= 5, `${area} Blender manifest expected >= 5 props, got ${items.length}`);
    for (const item of items) {
      assert.ok(item.triangles >= 15000, `${area}/${item.name} Blender GLB below 15000 tris: ${item.triangles}`);
    }
  }
});

test('underground Blender GLBs stay within triangle budget, single mesh/material, and valid silhouette bounds', async () => {
  const manifest = JSON.parse(await fs.readFile('assets/runtime-sources/underground/manifest.json', 'utf8'));
  const areas = Object.entries(manifest.areas ?? {});
  assert.equal(areas.length, 6);
  let checked = 0;
  for (const [area, items] of areas) {
    for (const item of items) {
      const glbPath = path.join('assets', 'runtime-sources', 'underground', item.file);
      const bytes = await fs.readFile(glbPath);
      const stats = inspectGlbJson(readGlbJson(bytes, glbPath));
      assert.ok(
        stats.triangles >= 15000 && stats.triangles <= 26000,
        `${area}/${item.name} triangles ${stats.triangles} outside [15000, 26000]`,
      );
      assert.equal(stats.triangles, item.triangles, `${area}/${item.name} manifest/GLB triangle mismatch`);
      assert.equal(stats.materials, 1, `${area}/${item.name} expected 1 material, got ${stats.materials}`);
      assert.equal(stats.meshes, 1, `${area}/${item.name} expected 1 mesh object, got ${stats.meshes}`);
      assert.ok(stats.sceneBounds, `${area}/${item.name} missing sceneBounds`);
      const spanX = stats.sceneBounds.max[0] - stats.sceneBounds.min[0];
      const spanZUp = stats.sceneBounds.max[1] - stats.sceneBounds.min[1];
      const spanYDepth = stats.sceneBounds.max[2] - stats.sceneBounds.min[2];
      assert.ok(spanX > 0.4, `${area}/${item.name} span_x ${spanX} <= 0.4`);
      assert.ok(spanYDepth > 0.2, `${area}/${item.name} span_y ${spanYDepth} <= 0.2`);
      assert.ok(spanZUp > 0.8, `${area}/${item.name} span_z ${spanZUp} <= 0.8`);
      checked += 1;
    }
  }
  assert.equal(checked, 30);
});
