import { PlanGrid, rect } from './SettlementGeometry.js';
const PAD_BLEND = 3;

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
      const [ax, az] = street.points[index - 1];
      const [bx, bz] = street.points[index];
      const halfWidth = street.width / 2;
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
      const cx = (ax + bx) / 2;
      const cz = (az + bz) / 2;
      grid.insert(item, cx, cz, Math.hypot(bx - ax, bz - az) / 2 + halfWidth);
    }
  }
  return { grid, squares: plan.squares ?? [] };
}

export function indexPlan(plan) {
  const job = settlementPlanIndexJob(plan);
  for (;;) { const step = job.next(); if (step.done) return step.value; }
}
