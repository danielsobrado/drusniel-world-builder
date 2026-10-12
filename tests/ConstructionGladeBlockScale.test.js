import assert from 'node:assert/strict';
import test from 'node:test';
import { splitCell } from '../src/editor/construction/masonry/CourseLattice.js';
import { layoutOpening } from '../src/editor/construction/masonry/OpeningLayout.js';
import { layoutMerlon } from '../src/editor/construction/masonry/MerlonOrnament.js';
import { packCurvedWall } from '../src/editor/construction/masonry/CurvedCoursePacker.js';
import { createCurveArcTable } from '../src/editor/construction/masonry/CurveArcTable.js';
import { createWallTopProfile } from '../src/editor/construction/masonry/WallTopProfile.js';
import { constructionStyle, defineConstructionStyle } from '../src/editor/construction/masonry/ConstructionStyleCatalog.js';
import { normalizeConstructionRecord } from '../src/editor/construction/ConstructionSchema.js';
import { createCubicBezierPathFromStroke, sampleCubicBezierPath } from '../src/editor/construction/curve/CubicBezierPath.js';
import { planWallGrowth } from '../src/editor/construction/masonry/WallGrowth.js';

function wall({ key = 'glade-sandstone', top = 'flat', height = 3.5, points = [[0, 0], [8, 0], [16, 0], [24, 0]] } = {}) {
  const record = normalizeConstructionRecord({
    version: 1, id: 'glade-scale', revision: 1, seed: 3141, kind: 'wall',
    style: { key, version: 1 }, dimensions: { height, thickness: 0.8 }, top: { style: top },
    path: createCubicBezierPathFromStroke(points, { simplifyTolerance: 0.01 }), features: [],
  });
  const style = constructionStyle(key);
  const arcTable = createCurveArcTable(sampleCubicBezierPath(record.path));
  return { record, style, arcTable, profile: createWallTopProfile(record, arcTable, { style }) };
}

function pack({ record, style, arcTable, profile }, arcRange = [0, arcTable.totalLength]) {
  return packCurvedWall({
    arcTable, arcRange, style, thickness: 0.8, seed: record.seed,
    wallRange: [0, arcTable.totalLength], heightReference: record.dimensions.height,
    topHeightAt: profile.heightAt, ruinFactorAt: profile.ruinFactorAt, slopeAt: profile.slopeAt,
    topStyle: record.top.style, crenellationsOver: profile.crenellationsOver,
  });
}

test('an aspect-limited split never stands a leaf upright and keeps cutting along the bed', () => {
  for (let seed = 1; seed <= 200; seed += 1) {
    const cell = { courseIndex: 1, s0: seed * 0.37, s1: seed * 0.37 + 0.9 };
    const leaves = splitCell(cell, {
      seed, chance: 0.9, maxDepth: 2, minWidth: 0.3, minHeight: 0.28,
      courseHeight: 1.2, horizontalChance: 0, minAspect: 1.05,
    });
    // Even with vertical cuts forced, a cut leaf is never narrower than the
    // aspect allows; cuts that would be become bed cuts.
    for (const leaf of leaves) {
      const width = leaf.s1 - leaf.s0;
      const height = (leaf.v1 - leaf.v0) * 1.2;
      assert.ok(Math.abs(width - 0.9) < 1e-9 || width >= 1.05 * height - 1e-9, `seed ${seed}: upright leaf`);
    }
  }
  // Without the limit the old behaviour is untouched.
  const free = splitCell({ courseIndex: 1, s0: 0, s1: 0.9 }, {
    seed: 7, chance: 1, maxDepth: 1, minWidth: 0.1, courseHeight: 1.2, horizontalChance: 0,
  });
  assert.equal(free.length, 2);
  assert.ok(free.every((leaf) => leaf.s1 - leaf.s0 < 0.9));
});

test('glade field stones lie on their beds, about five courses to a wall', () => {
  const context = wall();
  const { stones } = pack(context);
  const field = stones.filter((stone) => stone.category === 'field');
  assert.ok(field.length > 0);
  const upright = field.filter((stone) => {
    const width = stone.support.span[1] - stone.support.span[0];
    const height = stone.support.top - stone.support.bottom;
    return width < height * 0.6;
  });
  assert.ok(upright.length / field.length < 0.03, `${upright.length} of ${field.length} are slivers`);
  // About 1.5 stones per square metre of face, not the former 7.
  const density = field.length / (context.arcTable.totalLength * 3.5);
  assert.ok(density > 0.8 && density < 2.5, `density ${density}`);
});

test('a tight curve keeps big blocks when the mesher bends stones to the arc', () => {
  const radius = 4;
  const points = Array.from({ length: 9 }, (_, i) => {
    const angle = (i / 8) * Math.PI;
    return [Math.cos(angle) * radius, Math.sin(angle) * radius];
  });
  const bent = wall({ points });
  const chorded = { ...bent, style: defineConstructionStyle({ ...bent.style, curveWidthTolerance: null }) };
  const mean = (result) => {
    const field = result.stones.filter((stone) => stone.category === 'field');
    return field.reduce((sum, stone) => sum + stone.support.span[1] - stone.support.span[0], 0) / field.length;
  };
  const ratio = mean(pack(bent)) / mean(pack(chorded));
  assert.ok(ratio > 1.2, `bent/chorded mean width ${ratio}`);
});

test('varied merlons stay apart, agree across modules and add stacked teeth', () => {
  const context = wall({ top: 'crenellated' });
  const { profile, style } = context;
  const all = profile.crenellationsOver(0, 24);
  for (let i = 1; i < all.length; i += 1) {
    assert.ok(all[i].s - all[i].width / 2 > all[i - 1].s + all[i - 1].width / 2, 'teeth never touch');
  }
  const widths = new Set(all.map((merlon) => merlon.width.toFixed(3)));
  assert.ok(widths.size > all.length / 2, 'widths vary');
  assert.ok(all.some((merlon) => merlon.height > style.merlonHeight), 'some teeth are stacked');
  const left = profile.crenellationsOver(0, 12);
  const right = profile.crenellationsOver(12, 24);
  for (const merlon of [...left, ...right]) {
    assert.ok(all.some((other) => other.s === merlon.s && other.width === merlon.width), 'modules agree');
  }
  for (const merlon of all) {
    const { units, columns } = layoutMerlon(merlon, {
      minWidth: style.minWidth, thickness: 0.8, seed: 3141, index: 0,
      courseHeight: style.merlonCourseHeight, maxColumns: style.merlonMaxColumns,
    });
    assert.equal(columns, 1);
    assert.ok(units.length <= 3);
  }
});

test('a regular crown is unchanged when merlon variation is zero', () => {
  const context = wall({ top: 'crenellated', key: 'coursed-rubble' });
  const merlons = context.profile.crenellationsOver(0, 24);
  const spacing = context.style.merlonSpacing;
  for (const merlon of merlons) {
    if (merlon.s - merlon.width / 2 <= 1e-9 || merlon.s + merlon.width / 2 >= 24 - 1e-9) continue;
    assert.ok(Math.abs(merlon.width - spacing * 0.55) < 1e-9);
    assert.ok(Math.abs(((merlon.s / spacing) % 1) - 0.5) < 1e-9);
  }
});

test('opening surrounds use stones of the wall scale', () => {
  const arch = { id: 'a', kind: 'arch', s: 12, width: 2.4, height: 2.6, sill: 0, profile: 'round', dressed: true, group: null };
  const small = layoutOpening(arch, { thickness: 0.8 });
  const large = layoutOpening(arch, { thickness: 0.8, blockScale: 1.7 });
  assert.ok(large.voussoirs.length < small.voussoirs.length);
  assert.ok(large.jambs.length < small.jambs.length);
  assert.equal((large.voussoirs.length + 1) % 2, 1, 'odd ring keeps a central keystone');
});

test('glade ivy climbs in angular zig-zag runs', () => {
  const { record, arcTable } = wall({ height: 3.2 });
  const leaves = planWallGrowth(record, arcTable, [0, 24]);
  const stems = leaves.filter((leaf) => leaf.stem && !leaf.stem.rooted).map((leaf) => leaf.stem);
  assert.ok(stems.length > 4);
  const jogs = stems.filter((stem) => Math.abs(stem.to[0] - stem.from[0]) > 0.05);
  assert.ok(jogs.length > stems.length / 2, 'most runs move sideways as they climb');
  assert.deepEqual(planWallGrowth(record, arcTable, [0, 24]), leaves);
});
