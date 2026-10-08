export function pointInShape(point, boundary) {
  let inside = false;
  for (let i = 0, j = boundary.length - 1; i < boundary.length; j = i++) {
    const a = boundary[i],
      b = boundary[j];
    if (
      a[1] > point[1] !== b[1] > point[1] &&
      point[0] < ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      inside = !inside;
  }
  return inside;
}

export function shapeEnvelopeAtHeight(plan, height) {
  const t = Math.max(0, Math.min(1, (height - plan.primitive.elevation) / plan.primitive.height));
  return plan.boundary.map((point, i) => [
    point[0] + (plan.topBoundary[i][0] - point[0]) * t,
    point[1] + (plan.topBoundary[i][1] - point[1]) * t,
  ]);
}
