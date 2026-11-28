const MARGIN = 1.2;
const MIN_HEIGHT_RATIO = 0.25;
const MIN_COVERAGE_RATIO = 0.002;

export function galleryFrame(min, max) {
  const size = max.map((value, index) => value - min[index]);
  const center = max.map((value, index) => (value + min[index]) / 2);
  if (![...size, ...center].every(Number.isFinite) || size.some(value => value < 0)) {
    throw new Error('Invalid gallery bounds.');
  }
  const extent = Math.max(0.1, size[0], size[1]);
  return { center, halfSize: extent * MARGIN / 2, distance: Math.max(1, extent, size[2]) * 3 };
}

/** Alpha-based occupancy catches blank, tiny or clipped captures, not silhouette equivalence. */
export function galleryCoverage(pixels, width, height) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0
      || pixels.length !== width * height * 4) throw new RangeError('Invalid gallery pixel buffer.');
  let occupied = 0, minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (pixels[(y * width + x) * 4 + 3] < 128) continue;
      occupied++;
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
  }
  const coverage = occupied / (width * height);
  const heightRatio = occupied ? (maxY - minY + 1) / height : 0;
  const widthRatio = occupied ? (maxX - minX + 1) / width : 0;
  const clipped = occupied > 0 && (minX === 0 || minY === 0 || maxX === width - 1 || maxY === height - 1);
  return { coverage, heightRatio, widthRatio, clipped,
    passed: coverage >= MIN_COVERAGE_RATIO && Math.max(heightRatio, widthRatio) >= MIN_HEIGHT_RATIO && !clipped };
}
