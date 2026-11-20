import assert from 'node:assert/strict';
import sharp from 'sharp';

export async function stoneholdVisualGates(references, heroImage, reflectionImage) {
  const keys = ['hero', 'empty', 'shadowless', 'reflection', 'emptyReflection'];
  const decode = image => sharp(image).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const [hero, empty, shadowless, reflection, emptyReflection, actual, actualReflection] = await Promise.all([
    ...keys.map(key => references.get(key)), heroImage, reflectionImage,
  ].map(decode));
  const { width, height, channels } = hero.info;
  const images = [hero, empty, shadowless, reflection, emptyReflection, actual, actualReflection];
  assert.ok(channels === 3 && images.every(({ info }) => info.width === width && info.height === height && info.channels === channels));
  const luma = (image, i) => (image.data[i] * 54 + image.data[i + 1] * 183 + image.data[i + 2] * 19) / 256;
  const limit = 0.20;
  const metrics = Object.fromEntries(['silhouette', 'shadow', 'reflectedContent', 'reflectorForeground'].map(key => [key, {
    expectedPixels: 0, missingPixels: 0, worstTile: 0,
  }]));
  for (let top = 0; top < height; top += 32) {
    for (let left = 0; left < width; left += 32) {
      const tiles = Object.fromEntries(Object.keys(metrics).map(key => [key, [0, 0]]));
      const add = (key, missing) => { tiles[key][0]++; tiles[key][1] += Number(missing); };
      for (let y = top; y < Math.min(top + 32, height); y++) {
        for (let x = left; x < Math.min(left + 32, width); x++) {
          const i = (y * width + x) * 3;
          const ground = luma(empty, i);
          const solid = luma(hero, i);
          const reflected = luma(reflection, i);
          const target = luma(actual, i);
          const targetReflected = luma(actualReflection, i);
          if (solid - ground > 80) {
            add('silhouette', target - ground < 35);
            if (Math.abs(solid - reflected) < 10) add('reflectorForeground', target - targetReflected > 45);
          }
          if (ground - solid > 24 && luma(shadowless, i) - solid > 24) add('shadow', target - solid > 0.6 * (ground - solid));
          const mirrorGround = luma(emptyReflection, i);
          if (solid - ground < 20 && reflected - mirrorGround > 35) add('reflectedContent', targetReflected - mirrorGround < 10);
        }
      }
      for (const [name, [expected, missing]] of Object.entries(tiles)) {
        const metric = metrics[name];
        metric.expectedPixels += expected;
        metric.missingPixels += missing;
        if (expected >= 64) metric.worstTile = Math.max(metric.worstTile, missing / expected);
      }
    }
  }
  for (const [name, metric] of Object.entries(metrics)) {
    assert.ok(metric.expectedPixels >= 64, `Stonehold visual reference has inadequate ${name} coverage`);
    metric.passed = metric.worstTile <= limit;
  }
  return metrics;
}
