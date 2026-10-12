import { radialDistance, sampleGrid, saturate, smooth, writeShadedTile } from './tileSurface.js';

/**
 * Volumetric-looking tiles: billowing smoke puffs, the eroding fireball
 * flipbook, storm cloud and flame tongues. All are coverage fields shaded
 * with a spherical bulge so lit smoke reads as round lumps, not cards.
 */

/** Sum of |2n − 1|: lumps with dark creases between them (cauliflower smoke). */
function billow(noise, u, v, octaves) {
  let sum = 0;
  let amplitude = 0.5;
  let frequency = 1;
  let norm = 0;
  for (let octave = 0; octave < octaves; octave += 1) {
    sum += (1 - Math.abs(noise.noise2(u * frequency, v * frequency) * 2 - 1)) * amplitude;
    norm += amplitude;
    amplitude *= 0.52;
    frequency *= 2.07;
  }
  return sum / norm;
}

function puffField(noise, variant, frequency, u, v) {
  const ox = variant * 17.31;
  const oy = variant * 9.13;
  const wx = noise.fbm2(u * 2.6 + ox, v * 2.6 + oy, 3) - 0.5;
  const wy = noise.fbm2(u * 2.6 + oy + 40, v * 2.6 + ox, 3) - 0.5;
  const r = radialDistance(u + wx * 0.1, v + wy * 0.1) * 1.08;
  const lumps = billow(noise, u * frequency + ox, v * frequency + oy, 4);
  const dome = Math.max(0, 1 - r * r);
  return { r, lumps, dome };
}

/**
 * Smoke puff. The silhouette is a soft dome eroded by noise rather than a
 * disc with a rim: overlapping puffs must melt into one another, so coverage
 * rises gently over a wide band and the edge normals stay weak (a steep edge
 * gradient lights every puff's outline as a ring).
 */
export function paintSmoke(surface, noise, variant) {
  const { size } = surface;
  const detail = new Float32Array(size * size);
  const coverage = sampleGrid(size, (u, v, x, y) => {
    const { r, lumps, dome } = puffField(noise, variant, 2.8, u, v);
    const ragged = noise.fbm2(u * 5.2 + variant * 3.1, v * 5.2 - variant * 1.7, 3) - 0.5;
    detail[y * size + x] = saturate(dome * 0.6 + lumps * 0.7 - 0.3);
    const body = saturate((dome - 0.08 + (lumps - 0.5) * 0.7) * 1.45);
    return body * smooth(1.0, 0.45, r + ragged * 0.4);
  });
  writeShadedTile(surface, coverage, detail, { bulge: 0.32, bump: 2.5 });
}

/**
 * A bank of ground fog, much wider than tall: a soft flat underside and a
 * lumpy, rolling top that thins into wisps, so a bank of these overlapping low
 * over the ground has a silhouette instead of reading as a blurred band.
 */
export function paintFogBank(surface, noise) {
  const { size } = surface;
  const detail = new Float32Array(size * size);
  const coverage = sampleGrid(size, (u, v, x, y) => {
    const dx = (u - 0.5) / 0.46;
    const wisps = noise.fbm2(u * 4.2 + 11, v * 6 + 3, 4);
    const crest = noise.fbm2(u * 2.4 + 5, 1.7, 3);
    const top = 0.36 + 0.34 * crest * (1 - dx * dx * 0.7) + (wisps - 0.5) * 0.06;
    const bottom = 0.12;
    const ends = smooth(1, 0.55, Math.abs(dx) + (wisps - 0.5) * 0.35);
    const vertical = smooth(bottom, bottom + 0.14, v) * smooth(top + 0.06, top - 0.2, v);
    const body = billow(noise, u * 5 + 21, v * 5 + 2, 3);
    detail[y * size + x] = saturate(0.3 + body * 0.45 + (v - bottom) * 0.4);
    return saturate(ends * vertical * (0.65 + body * 0.5));
  });
  writeShadedTile(surface, coverage, detail, { bulge: 0.15, bump: 1.6 });
}

/** The cloud deck over Ice Storm: broader, softer, flatter underside. */
export function paintCloud(surface, noise) {
  const { size } = surface;
  const detail = new Float32Array(size * size);
  const coverage = sampleGrid(size, (u, v, x, y) => {
    const { r, lumps, dome } = puffField(noise, 31, 2.6, u, v * 1.15 - 0.05);
    const underside = smooth(0.12, 0.34, v);
    detail[y * size + x] = saturate(lumps * 0.8 + v * 0.3 - 0.2);
    return saturate((dome * 1.4 + (lumps - 0.5) * 0.9) * 1.5) * smooth(1.0, 0.7, r) * underside;
  });
  writeShadedTile(surface, coverage, detail, { bulge: 0.4, bump: 5 });
}

/**
 * Eroding fireball flipbook: the same puff, growing slightly while its
 * coverage threshold rises, so late frames tear into wisps. Detail is the
 * heat mask: a hot core that shrinks frame by frame.
 */
export function paintFireFrame(surface, noise, frame, frameCount) {
  const { size } = surface;
  const t = frame / Math.max(1, frameCount - 1);
  const erosion = t * 0.62;
  const detail = new Float32Array(size * size);
  const coverage = sampleGrid(size, (u, v, x, y) => {
    const scale = 0.72 + 0.28 * t;
    const cu = 0.5 + (u - 0.5) / scale;
    const cv = 0.5 + (v - 0.5) / scale;
    const { r, lumps, dome } = puffField(noise, 101, 3, cu, cv);
    const body = saturate((dome - 0.1 + (lumps - 0.5) * 0.9) * 2.2) * smooth(1.0, 0.74, r);
    const eroded = saturate((body - erosion * (1.15 - lumps * 0.5)) / (1 - erosion * 0.75));
    detail[y * size + x] = saturate((1 - r * 0.95) * (0.45 + lumps * 0.7) * (1 - t * 0.55));
    return eroded;
  });
  writeShadedTile(surface, coverage, detail, { bulge: 0.75, bump: 4 });
}

/** A single licking flame, base at v = 0, for ground fires and Wall of Fire. */
export function paintFlameTongue(surface, noise, variant) {
  const { size } = surface;
  const detail = new Float32Array(size * size);
  const coverage = sampleGrid(size, (u, v, x, y) => {
    const offset = variant * 13.7;
    const sway = (noise.fbm2(u * 1.8 + offset, v * 2.6 - offset, 3) - 0.5) * 0.42 * v;
    const lateral = Math.abs(u - 0.5 + sway);
    const width = 0.27 * Math.pow(saturate(1 - v * 1.05), 0.75) * (0.55 + 0.45 * smooth(0, 0.22, v));
    const tear = (noise.fbm2(u * 5.5 + offset, v * 4.5 - offset * 0.5, 4) - 0.5) * 0.75 * v;
    // Past the tip the width reaches zero, and smooth(0, 0, x) would cover the whole row.
    const body = width > 1e-3 ? smooth(width, width * 0.3, lateral) * smooth(0.02, 0.1, v) : 0;
    const core = saturate(1 - lateral / Math.max(1e-3, width));
    detail[y * size + x] = saturate(core * core * (1.15 - v));
    return saturate(body + tear * body);
  });
  writeShadedTile(surface, coverage, detail, { bulge: 0.35, bump: 3 });
}
