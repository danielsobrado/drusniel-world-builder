/** Relational pixel checks adapted from Gods' End's environment parity QA. */
export function imageMetrics(data, channels = 3) {
  if (![3, 4].includes(channels) || data.length % channels) throw new Error('Expected RGB or RGBA pixels.');
  let covered = 0, brightness = 0;
  for (let i = 0; i < data.length; i += channels) {
    const value = data[i] + data[i + 1] + data[i + 2];
    brightness += value;
    if (value > 30) covered++;
  }
  return { pixels: data.length / channels, covered, brightness };
}

export function compareRenderedImages(reference, actual, options = {}) {
  if (reference.width !== actual.width || reference.height !== actual.height) throw new Error('Image dimensions differ.');
  const left = imageMetrics(reference.data, reference.channels), right = imageMetrics(actual.data, actual.channels);
  const failures = [];
  if (left.covered < (options.minimumCoveredPixels ?? 1000) || right.covered < (options.minimumCoveredPixels ?? 1000)) failures.push('Rendered content is missing.');
  let maskDifference = 0, colorError = 0;
  for (let pixel = 0; pixel < left.pixels; pixel++) {
    const a = pixel * reference.channels, b = pixel * actual.channels;
    const aLit = reference.data[a] + reference.data[a + 1] + reference.data[a + 2] > 30;
    const bLit = actual.data[b] + actual.data[b + 1] + actual.data[b + 2] > 30;
    if (aLit !== bLit) maskDifference++;
    for (let c = 0; c < 3; c++) colorError += Math.abs(reference.data[a + c] - actual.data[b + c]);
  }
  const metrics = { reference: left, actual: right,
    coverageDelta: Math.abs(right.covered - left.covered) / Math.max(1, left.covered),
    maskDifference: maskDifference / Math.max(1, left.covered),
    meanColorError: colorError / (left.pixels * 3),
    brightnessRatio: right.brightness / Math.max(1, left.brightness) };
  if (metrics.coverageDelta > (options.maximumCoverageDelta ?? 0.1)) failures.push('Rendered coverage changed.');
  if (metrics.maskDifference > (options.maximumMaskDifference ?? 0.15)) failures.push('Rendered silhouette changed.');
  if (metrics.meanColorError > (options.maximumMeanColorError ?? 20)) failures.push('Rendered color differs.');
  if (options.minimumBrightnessRatio !== undefined && metrics.brightnessRatio < options.minimumBrightnessRatio) failures.push('Enabled effect did not change rendered pixels.');
  if (options.maximumBrightnessRatio !== undefined && metrics.brightnessRatio > options.maximumBrightnessRatio) failures.push('Backend brightness differs.');
  return { passed: failures.length === 0, failures, ...metrics };
}
