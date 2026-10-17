import assert from 'node:assert/strict';
import { compareRenderedImages } from './rendered-image-metrics.mjs';

function regionMean(image, [left, top, width, height]) {
  const mean = [0, 0, 0];
  for (let y = top; y < top + height; y++) for (let x = left; x < left + width; x++) {
    const index = (y * image.width + x) * image.channels;
    for (let c = 0; c < 3; c++) mean[c] += image.data[index + c] / (width * height);
  }
  return mean;
}

export function checkUnderwaterWaterline(images, report) {
  const record = (id, passed, metrics) => {
    report.checks.push({ ...metrics, id, passed });
    assert.ok(passed, `${id}: ${JSON.stringify(metrics)}`);
  };
  for (const backend of ['webgpu', 'webgl']) {
    for (const position of ['above', 'below']) {
      const reference = images.get(`${backend}-waterline-${position}-off`);
      const actual = images.get(`${backend}-waterline-${position}`);
      const before = regionMean(reference, [340, 300, 280, 160]);
      const after = regionMean(actual, [340, 300, 280, 160]);
      record(`${backend} ${position}: wet bed takes water colour`,
        before[0] - after[0] > 20 && after[2] / after[0] - before[2] / before[0] > .15,
        { before, after });
      for (const [name, region] of [['sky', [360, 20, 260, 160]], ['dry shore', [155, 140, 100, 80]]]) {
        const before = regionMean(reference, region), after = regionMean(actual, region);
        const error = Math.max(...before.map((value, c) => Math.abs(value - after[c])));
        record(`${backend} ${position}: ${name} retains colour`, error <= 1, { before, after, error });
      }
      const state = report.backends[backend].cases.find(c => c.id === `waterline-${position}`);
      record(`${backend} ${position}: works before global head blend`,
        state.optical && state.blend === 0 && state.waterlineBlend > .9, state);
    }
    const lake = compareRenderedImages(images.get(`${backend}-waterline-lake`),
      images.get(`${backend}-waterline-lake-rebased`), { maximumMeanColorError: 1 });
    record(`${backend} raised lake survives rebase`, lake.passed, lake);
    const far = compareRenderedImages(images.get(`${backend}-waterline-far-off`),
      images.get(`${backend}-waterline-far`), { maximumMeanColorError: 0 });
    record(`${backend} high camera bypasses waterline optics`, far.passed, far);
    for (const id of ['waterline-dry', 'waterline-far']) {
      const state = report.backends[backend].cases.find(c => c.id === id);
      record(`${backend} ${id}: surface path restored`, !state.optical && !state.active, state);
    }
  }
  for (const id of ['above', 'below', 'lake', 'lake-rebased', 'dry', 'far']) {
    const result = compareRenderedImages(images.get(`webgpu-waterline-${id}`),
      images.get(`webgl-waterline-${id}`), { maximumMeanColorError: 2 });
    record(`backend parity waterline-${id}`, result.passed, result);
  }
}
