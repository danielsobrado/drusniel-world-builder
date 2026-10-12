import { gaussian, radialDistance, sampleGrid, saturate, smooth, writeShadedTile } from './tileSurface.js';

/**
 * Ground decals. Coverage (A) is the stain; detail (B) is the part that can
 * glow — ember cracks in a scorch, glints in frost, veins in blight — which
 * the decal shader feeds through the decal's colour ramp by its heat.
 */

function polar(u, v) {
  const x = u - 0.5;
  const y = v - 0.5;
  return { r: radialDistance(u, v), angle: Math.atan2(y, x), x, y };
}

/** Blast scorch: char with burst rays, glowing ember cracks near the centre. */
export function paintScorch(surface, noise, variant) {
  const { size } = surface;
  const detail = new Float32Array(size * size);
  const offset = variant * 23.7;
  const coverage = sampleGrid(size, (u, v, x, y) => {
    const { r, angle } = polar(u, v);
    const rays = noise.fbm2(Math.cos(angle) * 3 + offset, Math.sin(angle) * 3 + offset, 4);
    const reach = 0.62 + rays * 0.48;
    const edge = (noise.fbm2(u * 6 + offset, v * 6, 4) - 0.5) * 0.35;
    const char = smooth(1, 0.35, r / reach + edge);
    const soot = 0.55 + 0.45 * noise.fbm2(u * 11 + offset, v * 11 - offset, 4);
    const cracks = smooth(0.8, 0.94, noise.ridged2(u * 5 + offset, v * 5 + offset, 5));
    detail[y * size + x] = saturate(cracks * smooth(0.8, 0.1, r) * 1.2);
    return saturate(char * soot * 1.25);
  });
  writeShadedTile(surface, coverage, detail, { bulge: 0, bump: 0 });
}

/** Rime: feathery ice branches growing out from the centre, glints in B. */
export function paintFrost(surface, noise) {
  const { size } = surface;
  const detail = new Float32Array(size * size);
  const coverage = sampleGrid(size, (u, v, x, y) => {
    const { r, angle } = polar(u, v);
    const veins = noise.ridged2(Math.cos(angle) * r * 4 + 3, Math.sin(angle) * r * 4 + 3, 5);
    const feather = smooth(0.55, 0.9, veins);
    const film = smooth(1, 0.3, r + (noise.fbm2(u * 5, v * 5, 4) - 0.5) * 0.4) * 0.45;
    const glint = noise.noise2(u * 40, v * 40);
    detail[y * size + x] = saturate(smooth(0.86, 0.97, glint) + feather * 0.35);
    return saturate((film + feather * 0.75) * smooth(1, 0.7, r));
  });
  writeShadedTile(surface, coverage, detail, { bulge: 0, bump: 0 });
}

function segmentDistance(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = saturate(((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy));
  return Math.hypot(px - ax - dx * t, py - ay - dy * t);
}

/** Two rings with runic ticks between them and a hexagram inside. */
export function paintRuneCircle(surface, noise, random) {
  const { size } = surface;
  const glyphs = Array.from({ length: 24 }, () => ({
    kind: Math.floor(random() * 4),
    tilt: random.range(-0.4, 0.4),
  }));
  const hexagram = [];
  for (let triangle = 0; triangle < 2; triangle += 1) {
    for (let corner = 0; corner < 3; corner += 1) {
      const a = (corner / 3) * Math.PI * 2 + triangle * Math.PI / 3 + Math.PI / 2;
      const b = ((corner + 1) / 3) * Math.PI * 2 + triangle * Math.PI / 3 + Math.PI / 2;
      hexagram.push([Math.cos(a) * 0.62, Math.sin(a) * 0.62, Math.cos(b) * 0.62, Math.sin(b) * 0.62]);
    }
  }
  const line = 0.022;
  const coverage = sampleGrid(size, (u, v) => {
    const { r, angle } = polar(u, v);
    const px = (u - 0.5) / 0.46;
    const py = (v - 0.5) / 0.46;
    let value = gaussian(r - 0.95, line) + gaussian(r - 0.7, line) + gaussian(r - 0.64, line * 0.6) * 0.6;
    if (r > 0.72 && r < 0.93) {
      const sector = ((angle / (Math.PI * 2)) + 1) % 1 * glyphs.length;
      const glyph = glyphs[Math.floor(sector)];
      const local = sector % 1 - 0.5;
      const radial = (r - 0.825) / 0.09;
      const strokes = [
        gaussian(local - glyph.tilt * radial * 0.3, 0.07),
        gaussian(radial, 0.18) * smooth(0.35, 0.2, Math.abs(local)),
        gaussian(local + radial * 0.3, 0.07) + gaussian(local - radial * 0.3, 0.07),
        gaussian(Math.hypot(local, radial * 0.4) - 0.22, 0.06),
      ];
      value += strokes[glyph.kind] * 0.9;
    }
    for (const [ax, ay, bx, by] of hexagram) {
      value += gaussian(segmentDistance(px, py, ax, ay, bx, by), line * 0.9) * 0.85;
    }
    value += gaussian(r - 0.18, line) * 0.7;
    return saturate(value * smooth(1.02, 0.97, r));
  });
  writeShadedTile(surface, coverage, coverage, { bulge: 0, bump: 0 });
}

/** Acid puddle: lobed splat, satellite droplets, bubble rings in B. */
export function paintAcidSplat(surface, noise, random) {
  const { size } = surface;
  const satellites = Array.from({ length: 9 }, () => {
    const angle = random() * Math.PI * 2;
    const distance = random.range(0.62, 0.9);
    return { x: Math.cos(angle) * distance, y: Math.sin(angle) * distance, r: random.range(0.04, 0.09) };
  });
  const detail = new Float32Array(size * size);
  const coverage = sampleGrid(size, (u, v, x, y) => {
    const { r, angle } = polar(u, v);
    const px = (u - 0.5) / 0.46;
    const py = (v - 0.5) / 0.46;
    const lobes = 0.55 + 0.12 * Math.sin(angle * 5 + 1.3) + 0.08 * Math.sin(angle * 9)
      + (noise.fbm2(Math.cos(angle) * 2, Math.sin(angle) * 2, 3) - 0.5) * 0.25;
    let value = smooth(lobes + 0.04, lobes - 0.04, r);
    for (const drop of satellites) {
      value = Math.max(value, smooth(drop.r, drop.r * 0.6, Math.hypot(px - drop.x, py - drop.y)));
    }
    const cells = noise.noise2(u * 18, v * 18);
    const bubbles = gaussian(cells - 0.78, 0.03) * value;
    detail[y * size + x] = saturate(bubbles * 1.4 + value * 0.25 * noise.fbm2(u * 7, v * 7, 3));
    return saturate(value * (0.8 + 0.2 * noise.fbm2(u * 9, v * 9, 3)));
  });
  writeShadedTile(surface, coverage, detail, { bulge: 0, bump: 0 });
}

/** Withered ground: grey-brown blight with glowing veins reaching out. */
export function paintBlight(surface, noise) {
  const { size } = surface;
  const detail = new Float32Array(size * size);
  const coverage = sampleGrid(size, (u, v, x, y) => {
    const { r } = polar(u, v);
    const veins = smooth(0.82, 0.95, noise.ridged2(u * 4 + 11, v * 4 + 11, 5));
    const stain = smooth(1, 0.25, r + (noise.fbm2(u * 4, v * 4, 4) - 0.5) * 0.5);
    detail[y * size + x] = saturate(veins * smooth(1, 0.2, r));
    return saturate(stain * 0.85 + veins * smooth(1, 0.4, r) * 0.6);
  });
  writeShadedTile(surface, coverage, detail, { bulge: 0, bump: 0 });
}

/** Star fracture: jagged cracks from the centre with short forks. */
export function paintCracks(surface, noise, random) {
  const { size } = surface;
  const segments = [];
  const arms = 9;
  for (let arm = 0; arm < arms; arm += 1) {
    let angle = (arm / arms) * Math.PI * 2 + random.range(-0.25, 0.25);
    let x = 0;
    let y = 0;
    const steps = 5 + Math.floor(random() * 3);
    for (let step = 0; step < steps; step += 1) {
      const length = random.range(0.1, 0.18);
      angle += random.range(-0.45, 0.45);
      const nx = x + Math.cos(angle) * length;
      const ny = y + Math.sin(angle) * length;
      segments.push([x, y, nx, ny, 1 - step / steps]);
      if (random() < 0.35) {
        const fork = angle + (random() < 0.5 ? -0.8 : 0.8);
        segments.push([nx, ny, nx + Math.cos(fork) * length * 0.6, ny + Math.sin(fork) * length * 0.6, 0.4]);
      }
      x = nx;
      y = ny;
    }
  }
  const coverage = sampleGrid(size, (u, v) => {
    const px = (u - 0.5) / 0.46;
    const py = (v - 0.5) / 0.46;
    let value = Math.exp(-(px * px + py * py) * 30) * 0.8;
    for (const [ax, ay, bx, by, weight] of segments) {
      value += gaussian(segmentDistance(px, py, ax, ay, bx, by), 0.012 + weight * 0.012) * (0.5 + weight * 0.5);
    }
    return saturate(value * smooth(1.05, 0.95, Math.hypot(px, py)));
  });
  writeShadedTile(surface, coverage, coverage, { bulge: 0, bump: 0 });
}
