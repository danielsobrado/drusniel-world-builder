import { PlanGrid, rect } from './SettlementGeometry.js';
const PAD_BLEND = 3;

function insertSegment(grid, [ax, az], [bx, bz], halfWidth) {
  const item = {
    street: true,
    halfWidth,
    distance(x, z) {
      const dx = bx - ax;
      const dz = bz - az;
      const lengthSquared = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / lengthSquared));
      return Math.hypot(x - (ax + dx * t), z - (az + dz * t));
    },
  };
  grid.insert(item, (ax + bx) / 2, (az + bz) / 2, Math.hypot(bx - ax, bz - az) / 2 + halfWidth);
}

/** One footprint or street segment per unit; the synchronous terrain worker uses the same index. */
export function* settlementPlanIndexJob(plan) {
  const grid = new PlanGrid(12);
  for (const building of plan.buildings) {
    yield;
    const box = rect(building.x, building.z, building.width, building.depth, building.yaw);
    grid.insert({ box, pad: building.pad }, box.x, box.z, box.radius + PAD_BLEND);
  }
  for (const street of plan.streets) {
    for (let index = 1; index < street.points.length; index += 1) {
      yield;
      insertSegment(grid, street.points[index - 1], street.points[index], street.width / 2);
    }
  }
  // Worn ground counts as street: road tile, and so no trees or grass on it.
  for (const { points, halfWidths } of plan.approaches ?? []) {
    for (let index = 1; index < points.length; index += 1) {
      yield;
      insertSegment(grid, points[index - 1], points[index], (halfWidths[index - 1] + halfWidths[index]) / 2);
    }
  }
  return { grid, squares: plan.squares ?? [] };
}

export function indexPlan(plan) {
  const job = settlementPlanIndexJob(plan);
  for (;;) { const step = job.next(); if (step.done) return step.value; }
}
