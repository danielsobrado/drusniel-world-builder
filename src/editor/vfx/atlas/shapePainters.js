import { gaussian, radialDistance, sampleGrid, saturate, smooth, writeShadedTile } from './tileSurface.js';

/**
 * Analytic emissive shapes: glows, flares, streaks, rings and beams. They are
 * mostly additive, so their detail channel equals a sharpened coverage (the
 * white-hot core), and their normals stay flat except for the droplet.
 */

function writeEmissive(surface, coverage, coreExponent = 2) {
  const detail = coverage.map((value) => value ** coreExponent);
  writeShadedTile(surface, coverage, detail, { bulge: 0, bump: 0 });
}

export function paintGlow(surface) {
  writeEmissive(surface, sampleGrid(surface.size, (u, v) => {
    const r = radialDistance(u, v);
    return saturate(Math.exp(-r * r * 4.5) * smooth(1, 0.85, r));
  }));
}

/** Lens-flare star: a hot point, a halo and four soft spikes. */
export function paintFlare(surface) {
  writeEmissive(surface, sampleGrid(surface.size, (u, v) => {
    const x = (u - 0.5) / 0.46;
    const y = (v - 0.5) / 0.46;
    const r = Math.hypot(x, y);
    const halo = Math.exp(-r * r * 9) * 0.85 + Math.exp(-r * r * 2.2) * 0.25;
    const spikes = gaussian(x, 0.035) * Math.exp(-Math.abs(y) * 2.6)
      + gaussian(y, 0.035) * Math.exp(-Math.abs(x) * 2.6);
    const diagonals = (gaussian(x - y, 0.05) + gaussian(x + y, 0.05)) * Math.exp(-r * 4.5) * 0.35;
    return saturate((halo + spikes * 0.7 + diagonals) * smooth(1, 0.82, r));
  }), 3);
}

/**
 * A structured flash: a hot point inside a short halo, and rays of uneven
 * length and width thrown out round it. Read with a ramp, the core goes white
 * and the rays keep their colour, so a flash has a shape instead of a disc.
 */
export function paintStarburst(surface, noise, random) {
  const rays = Array.from({ length: 22 }, (_, index) => ({
    angle: (index + random.range(-0.35, 0.35)) / 22 * Math.PI * 2,
    length: random.range(0.45, 1),
    width: random.range(0.016, 0.034),
    weight: random.range(0.45, 1),
  }));
  writeEmissive(surface, sampleGrid(surface.size, (u, v) => {
    const x = (u - 0.5) / 0.46;
    const y = (v - 0.5) / 0.46;
    const r = Math.hypot(x, y);
    let streaks = 0;
    for (const ray of rays) {
      const along = x * Math.cos(ray.angle) + y * Math.sin(ray.angle);
      if (along <= 0) continue;
      const across = Math.abs(-x * Math.sin(ray.angle) + y * Math.cos(ray.angle));
      const fade = saturate(1 - along / ray.length);
      streaks += gaussian(across, ray.width * (1 + along * 2.5)) * fade * ray.weight;
    }
    const core = Math.exp(-r * r * 45) + Math.exp(-r * r * 6) * 0.3;
    return saturate((core + streaks * 1.3) * smooth(1, 0.85, r));
  }), 1.6);
}

/** A capsule streak along v; sparks stretch it along their velocity. */
export function paintStreak(surface) {
  writeEmissive(surface, sampleGrid(surface.size, (u, v) => {
    const along = Math.abs(v - 0.5) / 0.47;
    const taper = Math.pow(saturate(1 - along), 0.6);
    return saturate(gaussian(u - 0.5, 0.11 * taper + 0.01) * taper);
  }), 2.5);
}

export function paintRing(surface, noise, radius, width, breakup) {
  const { size } = surface;
  const coverage = sampleGrid(size, (u, v) => {
    const r = radialDistance(u, v);
    const angle = Math.atan2(v - 0.5, u - 0.5);
    const jitter = breakup > 0
      ? (noise.fbm2(Math.cos(angle) * 2 + 5, Math.sin(angle) * 2 + 5, 4) - 0.5) * breakup
      : 0;
    const band = gaussian(r - radius - jitter * 0.4, width);
    const inner = breakup > 0 ? smooth(0, radius, r) * 0.12 * (1 - r) : 0;
    return saturate((band * (1 - jitter * 0.8) + inner) * smooth(1.02, 0.95, r));
  });
  writeEmissive(surface, coverage, 1.6);
}

/** Soft column with streaky vertical structure, for Moonbeam and Sunbeam. */
export function paintBeam(surface, noise) {
  writeEmissive(surface, sampleGrid(surface.size, (u, v) => {
    const ends = smooth(0, 0.18, v) * smooth(1, 0.8, v);
    const streaks = 0.7 + 0.3 * noise.fbm2(u * 9, v * 1.4 + 3, 3);
    return saturate(gaussian(u - 0.5, 0.2) * ends * streaks);
  }), 1.8);
}

/** Lightning segment glow: tight bright core inside a wider halo, round caps. */
export function paintBolt(surface) {
  writeEmissive(surface, sampleGrid(surface.size, (u, v) => {
    // Segments overlap their neighbours, so only the very ends taper.
    const along = Math.max(0, Math.abs(v - 0.5) - 0.42) / 0.06;
    const x = u - 0.5;
    const distance = Math.hypot(x, along * 0.05);
    return saturate(gaussian(distance, 0.035) + gaussian(distance, 0.14) * 0.45);
  }), 3);
}

/** Lit liquid droplet: round bottom tapering to a point, specular glint in B. */
export function paintDroplet(surface) {
  const { size } = surface;
  const normals = new Float32Array(size * size * 2);
  const detail = new Float32Array(size * size);
  const coverage = sampleGrid(size, (u, v, x, y) => {
    const cx = u - 0.5;
    const cy = v - 0.36;
    const radius = 0.24 * (cy > 0 ? Math.max(0, 1 - cy / 0.5) ** 0.9 : 1);
    const distance = Math.abs(cx) / Math.max(1e-3, radius);
    const vertical = cy < 0 ? Math.abs(cy) / 0.24 : 0;
    const r = Math.hypot(distance, vertical);
    const index = y * size + x;
    normals[index * 2] = cx / 0.26;
    normals[index * 2 + 1] = cy / 0.4;
    detail[index] = gaussian(Math.hypot(cx + 0.07, cy - 0.06), 0.05);
    return smooth(1, 0.85, r);
  });
  writeShadedTile(surface, coverage, detail, { normals });
}

export function paintMote(surface) {
  writeEmissive(surface, sampleGrid(surface.size, (u, v) => {
    const r = radialDistance(u, v);
    return saturate(Math.exp(-r * r * 40) + Math.exp(-r * r * 7) * 0.3);
  }), 2);
}

/** Four-point twinkle for frost glints and holy sparkles. */
export function paintTwinkle(surface) {
  writeEmissive(surface, sampleGrid(surface.size, (u, v) => {
    const x = (u - 0.5) / 0.46;
    const y = (v - 0.5) / 0.46;
    const r = Math.hypot(x, y);
    const cross = gaussian(x, 0.05) * Math.exp(-Math.abs(y) * 4)
      + gaussian(y, 0.05) * Math.exp(-Math.abs(x) * 4);
    return saturate((cross + Math.exp(-r * r * 30)) * smooth(1, 0.8, r));
  }), 2.5);
}

export function paintBubble(surface) {
  const { size } = surface;
  const detail = new Float32Array(size * size);
  const coverage = sampleGrid(size, (u, v, x, y) => {
    const r = radialDistance(u, v);
    const rim = gaussian(r - 0.82, 0.08);
    const glint = gaussian(Math.hypot(u - 0.36, v - 0.64), 0.06);
    detail[y * size + x] = saturate(glint + rim * 0.4);
    return saturate(rim + glint + 0.08 * smooth(0.85, 0.2, r));
  });
  writeShadedTile(surface, coverage, detail, { bulge: 0.8, bump: 0 });
}

/** A curling tendril along v: necrotic drain, wind, cure-wounds ribbons. */
export function paintWisp(surface, noise) {
  writeEmissive(surface, sampleGrid(surface.size, (u, v) => {
    const curl = Math.sin(v * Math.PI * 1.6) * 0.17 + (noise.fbm2(v * 3, 2.5, 3) - 0.5) * 0.12;
    const taper = Math.sin(saturate(v) * Math.PI) ** 0.8;
    return saturate(gaussian(u - 0.5 - curl, 0.07 * taper + 0.005) * taper);
  }), 1.8);
}

/** Six-armed flake with side branches. */
export function paintSnowflake(surface) {
  writeEmissive(surface, sampleGrid(surface.size, (u, v) => {
    const x = (u - 0.5) / 0.46;
    const y = (v - 0.5) / 0.46;
    const r = Math.hypot(x, y);
    const angle = Math.atan2(y, x);
    const sector = Math.PI / 3;
    const local = ((angle % sector) + sector) % sector - sector / 2;
    const arm = gaussian(Math.sin(local) * r, 0.045) * smooth(1, 0.85, r);
    const along = r * Math.cos(local);
    const branchPhase = Math.abs((along * 3.2) % 1 - 0.5);
    const branch = gaussian(Math.abs(Math.sin(local)) * r - branchPhase * 0.35, 0.04)
      * smooth(0.25, 0.4, r) * smooth(0.95, 0.75, r) * 0.7;
    return saturate(arm + branch + Math.exp(-r * r * 30) * 0.6);
  }), 1.5);
}
