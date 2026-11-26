/**
 * Pure tileable pixel builders for the packed sand detail map
 * (`public/assets/textures/sand/sand-detail-pack.png`):
 *   R, G — tangent-space micro-grain & wind-ripple normal XY (0.5 neutral)
 *   B    — wind-combed sand wave & mineral streak height (0..1)
 *   A    — high-frequency quartz sparkle & mineral grain variation (0..1)
 *
 * Source greyscale fields come from the CC0 library in `assets/source-library/noise/`.
 */

import { normalizeChannel } from './snow-ice-pack-math.mjs';

/**
 * Combines two normalized [0, 1] height channels with linear weights and
 * re-stretches the result to full [0, 1] dynamic range.
 */
export function blendHeightChannels(a, b, weightB) {
  const out = new Float32Array(a.length);
  const wA = 1 - weightB;
  for (let i = 0; i < a.length; i += 1) {
    out[i] = a[i] * wA + b[i] * weightB;
  }
  return normalizeChannel(out);
}

/**
 * Packs a tileable RGBA sand detail texture from three [0, 1] greyscale fields:
 *  - `grain`: fine quartz micro-grain height (drives tangent normal RG + sparkle A)
 *  - `ripple`: directional wind-combed ripple height (contributes subtle slope + wave B)
 *  - `broad`: softer dune/sheet mottling height (blended into wave B)
 *
 * Uses periodic central differences so the tangent normal wraps seamlessly at
 * all four edges.
 */
export function buildSandDetailPackPixels({
  size,
  grain,
  ripple,
  broad,
  grainSlopeScale = 1.35,
  rippleSlopeScale = 0.55,
}) {
  const count = size * size;
  const wave = blendHeightChannels(ripple, broad, 0.35);
  const combined = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    combined[i] = grain[i] * grainSlopeScale + ripple[i] * rippleSlopeScale;
  }

  const out = new Uint8Array(count * 4);
  const at = (x, y) => combined[((y + size) % size) * size + ((x + size) % size)];

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const idx = y * size + x;
      const dx = (at(x + 1, y) - at(x - 1, y)) * 0.5;
      const dy = (at(x, y + 1) - at(x, y - 1)) * 0.5;
      const nx = -dx;
      const ny = -dy;
      const invLen = 1 / Math.hypot(nx, ny, 1);
      const o = idx * 4;
      out[o] = Math.round(Math.max(0, Math.min(1, nx * invLen * 0.5 + 0.5)) * 255);
      out[o + 1] = Math.round(Math.max(0, Math.min(1, ny * invLen * 0.5 + 0.5)) * 255);
      out[o + 2] = Math.round(Math.max(0, Math.min(1, wave[idx])) * 255);
      out[o + 3] = Math.round(Math.max(0, Math.min(1, grain[idx])) * 255);
    }
  }
  return out;
}
