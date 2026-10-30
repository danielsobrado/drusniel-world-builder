const ARRIVE_METRES = 4;
const STUCK_SECONDS = 1.5;
const STUCK_METRES = 0.5;
const MAX_TURN_PER_FRAME = 0.08;

/** Main streets as one walk: outer end of the first, on through the others, nearest end first. */
export function streetRoute(streets, start, toCanonical) {
  const route = [start];
  const remaining = streets.map(street => street.points.map(toCanonical)).filter(points => points.length);
  while (remaining.length) {
    const from = route.at(-1);
    const gap = point => Math.hypot(point.x - from.x, point.z - from.z);
    let best = 0, flip = false, bestGap = Infinity;
    remaining.forEach((points, index) => {
      for (const [end, reversed] of [[points[0], false], [points.at(-1), true]]) {
        if (gap(end) < bestGap) { bestGap = gap(end); best = index; flip = reversed; }
      }
    });
    const [points] = remaining.splice(best, 1);
    route.push(...(flip ? points.reverse() : points));
  }
  return route;
}

/**
 * Keeps a benchmark walker moving along a canonical waypoint list: turns toward the
 * next point, ping-pongs at the ends, and hops forward when a wall holds it, so a
 * run measures the whole route instead of idling against a house.
 */
export class QaRouteWalker {
  constructor(route) {
    this.route = route;
    this.index = 1;
    this.direction = 1;
    this.anchor = null;
    this.hops = 0;
  }

  advance() {
    if (this.index + this.direction >= this.route.length || this.index + this.direction < 0) this.direction *= -1;
    this.index += this.direction;
  }

  /** @returns {{yaw:number, hop:{x:number,z:number}|null}} yaw eased from `yaw`; hop is a canonical teleport */
  update(x, z, yaw, seconds) {
    while (Math.hypot(this.route[this.index].x - x, this.route[this.index].z - z) < ARRIVE_METRES) this.advance();
    let hop = null;
    if (!this.anchor || Math.hypot(this.anchor.x - x, this.anchor.z - z) >= STUCK_METRES) {
      this.anchor = { x, z, seconds };
    } else if (seconds - this.anchor.seconds >= STUCK_SECONDS) {
      hop = this.route[this.index];
      this.hops += 1;
      this.anchor = null;
      this.advance();
    }
    const target = this.route[this.index];
    const wanted = Math.atan2(-(target.x - x), -(target.z - z));
    const delta = Math.atan2(Math.sin(wanted - yaw), Math.cos(wanted - yaw));
    return { yaw: yaw + Math.max(-MAX_TURN_PER_FRAME, Math.min(MAX_TURN_PER_FRAME, delta)), hop };
  }
}
