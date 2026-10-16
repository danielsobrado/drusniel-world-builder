/** A connected cap row with seated skirts and closed ends; no daylight between cap stations. */
export function buildShapeRoofCap(mesh, line, surface, tintAt, hidden = () => false) {
  if (line.length < 2) return;
  const rings = line.map((center, i) => {
    const a = line[Math.max(0, i - 1)], b = line[Math.min(line.length - 1, i + 1)];
    const run = Math.hypot(b[0] - a[0], b[2] - a[2]) || 1, n = [-(b[2] - a[2]) / run, (b[0] - a[0]) / run];
    const top = Array.from({ length: 7 }, (_, arc) => {
      const t = arc * Math.PI / 6, x = center[0] + n[0] * Math.cos(t) * 0.095, z = center[2] + n[1] * Math.cos(t) * 0.095;
      return [x, center[1] + 0.025 + Math.sin(t) * 0.09, z];
    });
    const seated = point => [point[0], Math.min(point[1] - 0.015, surface.heightAt(point[0], point[2]) - 0.004), point[2]];
    return [...top, seated(top[6]), seated(top[0])];
  });
  let distance = 0;
  for (let i = 1; i < rings.length; i++) {
    const a = rings[i - 1], b = rings[i], end = distance + Math.hypot(...line[i].map((v,k) => v - line[i - 1][k]));
    for (let side = 0; side < a.length; side++) {
      const next = (side + 1) % a.length, quad = [a[side], b[side], b[next], a[next]];
      if (!hidden(quad)) mesh.quad(...quad, tintAt(i - 1), [[distance, side * 0.05], [end, side * 0.05], [end, (side + 1) * 0.05], [distance, (side + 1) * 0.05]]);
    }
    distance = end;
  }
  for (const [ring, reverse, index] of [[rings[0], false, 0], [rings.at(-1), true, rings.length - 2]]) {
    const points = reverse ? ring.toReversed() : ring;
    for (let i = 1; i < points.length - 1; i++) {
      const triangle = [points[0], points[i], points[i + 1]];
      if (!hidden(triangle)) mesh.triangle(...triangle, tintAt(index));
    }
  }
}
