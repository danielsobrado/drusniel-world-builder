const LOOKAHEAD_SECONDS = 0.75;
const MAX_LOOKAHEAD_METERS = 150;
const MAX_SAMPLE_GAP_MS = 500;
const PRIORITY_WINDOW = 24;

export class DrawPreparationPriority {
  constructor() {
    this.previous = null;
    this.predicted = null;
    this.origin = { x: 0, z: 0 };
    this.turn = 0;
  }

  update(focus, origin, timestamp) {
    const previous = this.previous;
    const elapsed = previous ? timestamp - previous.timestamp : 0;
    let x = focus.x, z = focus.z;
    if (elapsed > 0 && elapsed <= MAX_SAMPLE_GAP_MS) {
      const dx = focus.x - previous.x, dz = focus.z - previous.z;
      const distance = Math.hypot(dx, dz);
      if (distance < MAX_LOOKAHEAD_METERS) {
        const factor = Math.min(LOOKAHEAD_SECONDS * 1000 / elapsed, MAX_LOOKAHEAD_METERS / Math.max(distance, 1));
        x += dx * factor; z += dz * factor;
      }
    }
    this.previous = { x: focus.x, z: focus.z, timestamp };
    this.predicted = { x, z };
    this.origin.x = origin.x; this.origin.z = origin.z;
  }

  *ordered(pending, pinned) {
    // Finish partial uploads first and give FIFO a regular turn.
    const first = pending.values().next().value;
    if (!first || !this.predicted || pinned(first) || ++this.turn % 4 === 0) { yield* pending; return; }
    const ranked = [];
    for (const mesh of pending) {
      if (pinned(mesh)) { yield mesh; yield* this.excluding(pending, mesh); return; }
      const elements = mesh.matrixWorld?.elements;
      const distance = elements ? (elements[12] + this.origin.x - this.predicted.x) ** 2
        + (elements[14] + this.origin.z - this.predicted.z) ** 2 : Infinity;
      ranked.push({ mesh, distance });
      if (ranked.length >= PRIORITY_WINDOW) break;
    }
    ranked.sort((a, b) => a.distance - b.distance);
    const visited = new Set(ranked.map(entry => entry.mesh));
    for (const { mesh } of ranked) yield mesh;
    for (const mesh of pending) if (!visited.has(mesh)) yield mesh;
  }

  *excluding(pending, excluded) { for (const mesh of pending) if (mesh !== excluded) yield mesh; }
}
