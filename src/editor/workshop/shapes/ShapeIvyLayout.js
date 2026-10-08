import { shapeRandom } from './ShapeMesh.js';

/** Stable root/branch/leaf keys: height edits clip growth rather than rerolling it. */
export function planShapeIvy(plan, seed, detail = 2) {
  const p = plan.primitive,
    leaves = [],
    stems = [];
  for (let root = 0; root < Math.ceil(plan.curve.length / 0.8); root++) {
    const random = (domain, key) => shapeRandom(seed, p.id, `ivy-${domain}`, `${root}:${key}`);
    if (random('root', 'present') > 0.33) continue;
    const origin = root * 0.8 + random('root', 'offset') * 0.5;
    const height = Math.min(p.height - 0.12, 1.3 + random('root', 'height') * 5.8);
    let previous;
    for (let row = 0; row * 0.27 + 0.12 < height; row++) {
      const y = row * 0.27 + 0.12;
      const u = origin + Math.sin(row * 0.62 + random('root', 'phase') * 6) * 0.16;
      if (previous) stems.push({ key: `${root}:${row}`, a: previous, b: [u, y] });
      previous = [u, y];
      const spread = 0.18 + (1 - y / (1.3 + random('root', 'height') * 5.8)) * 0.5;
      for (let branch = 0; branch < (detail >= 2 ? 4 : 2); branch++) {
        const key = `${row}:${branch}`;
        if (random('leaf', `${key}:present`) > 0.86) continue;
        const side = branch % 2 ? 1 : -1;
        leaves.push({
          key: `${root}:${key}`,
          u: u + side * (0.08 + random('leaf', `${key}:spread`) * spread),
          y: y + (random('leaf', `${key}:height`) - 0.5) * 0.25,
          size: 0.095 + random('leaf', `${key}:size`) * 0.085,
          angle: side * (0.35 + random('leaf', `${key}:angle`) * 0.9),
          shade: 0.65 + random('leaf', `${key}:shade`) * 0.35,
          lift: random('leaf', `${key}:lift`) * 0.05,
        });
      }
    }
  }
  return { leaves, stems };
}
