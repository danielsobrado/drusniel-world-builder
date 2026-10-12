import { saturate, smooth, writeShadedTile } from './tileSurface.js';

/**
 * Faceted solids — rock chunks, ice shards, ash flakes. Each facet carries its
 * own normal, so lit debris catches the sun on one face and goes dark on the
 * next as it tumbles (the billboard rotates, the normals rotate with it).
 */

function polygon(random, count, radiusMin, radiusMax, stretchY = 1) {
  const angles = Array.from({ length: count }, (_, index) => (
    (index + random.range(-0.32, 0.32)) / count * Math.PI * 2
  )).sort((a, b) => a - b);
  return angles.map((angle) => {
    const radius = random.range(radiusMin, radiusMax);
    return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius * stretchY, angle };
  });
}

/** Edge radius of a star-shaped polygon along the ray at `angle`. */
function rayHit(points, x, y) {
  const count = points.length;
  for (let index = 0; index < count; index += 1) {
    const a = points[index];
    const b = points[(index + 1) % count];
    const cross = (px, py, qx, qy) => px * qy - py * qx;
    const ab = cross(a.x, a.y, b.x, b.y);
    const ap = cross(a.x, a.y, x, y);
    const pb = cross(x, y, b.x, b.y);
    if (ab === 0) continue;
    if ((ap >= 0 && pb >= 0 && ab > 0) || (ap <= 0 && pb <= 0 && ab < 0)) {
      // Barycentric depth inside triangle (0, a, b): 1 at the edge.
      const edge = (ap + pb) / ab;
      return { index, edge };
    }
  }
  return { index: 0, edge: 2 };
}

function facetNormals(points, random, strength) {
  return points.map((point, index) => {
    const next = points[(index + 1) % points.length];
    const mx = (point.x + next.x) * 0.5;
    const my = (point.y + next.y) * 0.5;
    const length = Math.hypot(mx, my) || 1;
    const tilt = random.range(strength * 0.45, strength);
    return {
      x: (mx / length) * tilt + random.range(-0.15, 0.15),
      y: (my / length) * tilt + random.range(-0.15, 0.15),
      shade: random.range(0.35, 1),
    };
  });
}

function paintFaceted(surface, noise, points, normalsByFacet, detailFn) {
  const { size } = surface;
  const coverage = new Float32Array(size * size);
  const detail = new Float32Array(size * size);
  const normals = new Float32Array(size * size * 2);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = (x + 0.5) / size - 0.5;
      const v = (y + 0.5) / size - 0.5;
      const hit = rayHit(points, u, v);
      const index = y * size + x;
      const facet = normalsByFacet[hit.index];
      coverage[index] = smooth(1.04, 0.96, hit.edge);
      normals[index * 2] = facet.x * saturate(hit.edge * 1.4);
      normals[index * 2 + 1] = facet.y * saturate(hit.edge * 1.4);
      detail[index] = detailFn(u, v, hit, facet);
    }
  }
  writeShadedTile(surface, coverage, detail, { normals });
}

export function paintChunk(surface, noise, random, variant) {
  const points = polygon(random, 6 + (variant % 4), 0.26, 0.44);
  const facets = facetNormals(points, random, 0.75);
  paintFaceted(surface, noise, points, facets, (u, v, hit, facet) => {
    const grain = noise.fbm2(u * 9 + variant * 7, v * 9, 4);
    const crevice = smooth(0.9, 1.0, hit.edge) * 0.35;
    return saturate(facet.shade * (0.55 + grain * 0.6) - crevice);
  });
}

/** Elongated crystal: a ridge down the middle, two bevelled faces. */
export function paintShard(surface, noise, random, variant) {
  const width = random.range(0.11, 0.17);
  const points = [
    { x: random.range(-0.04, 0.04), y: 0.45 },
    { x: -width, y: random.range(0.02, 0.14) },
    { x: -width * 0.7, y: -0.3 },
    { x: random.range(-0.03, 0.03), y: -0.45 },
    { x: width * 0.75, y: -0.28 },
    { x: width, y: random.range(-0.06, 0.12) },
  ].map((point) => ({ ...point, angle: Math.atan2(point.y, point.x) }))
    .sort((a, b) => a.angle - b.angle);
  const facets = points.map((point, index) => {
    const next = points[(index + 1) % points.length];
    const side = Math.sign((point.x + next.x) || 1);
    return { x: side * random.range(0.55, 0.8), y: (point.y + next.y) * 0.9, shade: 1 };
  });
  paintFaceted(surface, noise, points, facets, (u, v, hit) => {
    const glint = smooth(0.82, 0.98, hit.edge) * 0.6 + (variant ? 0.25 : 0.35);
    const ridge = Math.exp(-(u * u) / 0.0006) * 0.5;
    return saturate(glint + ridge + noise.noise2(u * 20, v * 20) * 0.15);
  });
}

/** Small charred flake; detail marks its glowing rim for heat-driven embers. */
export function paintAsh(surface, noise, random) {
  const points = polygon(random, 7, 0.14, 0.3, 0.8);
  const facets = facetNormals(points, random, 0.4);
  paintFaceted(surface, noise, points, facets, (u, v, hit) => (
    saturate(smooth(0.6, 1, hit.edge) * (0.6 + noise.noise2(u * 14, v * 14) * 0.6))
  ));
}

/**
 * A cluster of ice spikes growing from the bottom of the tile, for crystals
 * left standing on the ground. Each spike is two bevelled faces, so the sun
 * catches one side; detail is the glint along the ridges and tips.
 */
export function paintCrystal(surface, noise, random) {
  const { size } = surface;
  const spikes = Array.from({ length: 6 }, (_, index) => ({
    lean: (index / 5 - 0.5) * 1.1 + random.range(-0.15, 0.15),
    root: 0.5 + (index / 5 - 0.5) * 0.28 + random.range(-0.03, 0.03),
    length: random.range(0.45, 0.9) * (1 - Math.abs(index / 5 - 0.5) * 0.7),
    width: random.range(0.05, 0.085),
  }));
  const coverage = new Float32Array(size * size);
  const detail = new Float32Array(size * size);
  const normals = new Float32Array(size * size * 2);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = (x + 0.5) / size;
      const v = (y + 0.5) / size;
      const index = y * size + x;
      let best = 0;
      for (const spike of spikes) {
        const dirX = Math.sin(spike.lean);
        const dirY = Math.cos(spike.lean);
        const px = u - spike.root;
        const py = v - 0.04;
        const along = (px * dirX + py * dirY) / spike.length;
        if (along < 0 || along > 1) continue;
        const across = (px * dirY - py * dirX) / (spike.width * (1 - along));
        const inside = 1 - Math.abs(across);
        if (inside <= best) continue;
        best = inside;
        const face = Math.sign(across) || 1;
        normals[index * 2] = face * dirY * 0.7;
        normals[index * 2 + 1] = -face * dirX * 0.7 + 0.25;
        detail[index] = saturate(Math.exp(-across * across * 30) * 0.7 + smooth(0.75, 1, along) * 0.6
          + noise.noise2(u * 24, v * 24) * 0.15);
      }
      coverage[index] = smooth(0, 0.18, best);
    }
  }
  writeShadedTile(surface, coverage, detail, { normals });
}
