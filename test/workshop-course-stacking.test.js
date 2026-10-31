import assert from 'node:assert/strict';
import test from 'node:test';

import { createRandom } from '../src/editor/workshop/ProceduralRandom.js';
import { stackCourses } from '../src/editor/workshop/ProceduralWorkshopCoursePacker.js';
import { wornMerlon } from '../src/editor/workshop/ProceduralWorkshopMerlonWear.js';

test('courses fill the wall exactly, unevenly and without gaps', () => {
  const courses = stackCourses(6, 0.34, createRandom(7));
  let bottom = 0;
  for (const { y, height } of courses) {
    assert.ok(Math.abs(y - height / 2 - bottom) < 1e-9, 'each course sits on the last');
    bottom += height;
  }
  assert.ok(Math.abs(bottom - 6) < 1e-9);
  const heights = courses.map(({ height }) => height);
  assert.ok(Math.max(...heights) / Math.min(...heights) > 1.3, 'courses must not be ruled lines');
  assert.deepEqual(courses, stackCourses(6, 0.34, createRandom(7)));
});

test('merlons wear down but never vanish or grow', () => {
  const random = createRandom(11);
  const worn = Array.from({ length: 400 }, () => wornMerlon(random, 0.62));
  assert.ok(worn.every(({ height }) => height >= 0.62 * 0.5 && height <= 0.62));
  assert.ok(worn.some(({ height }) => height < 0.62 * 0.75), 'a few are broken down');
  assert.ok(worn.some(({ height }) => height > 0.62 * 0.9), 'most stand near the line');
});
