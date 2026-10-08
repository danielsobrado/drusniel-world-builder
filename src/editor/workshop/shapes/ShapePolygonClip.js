/** Attribute-preserving polygon clipping, shared by generated roof surfaces and details. */
export function interpolateShapeVertex(a, b, t) {
  const mix = (values, next) => values?.map((v, i) => v + (next[i] - v) * t);
  const normal = mix(a.normal, b.normal);
  const length = normal ? Math.hypot(...normal) : 0;
  return {
    position: mix(a.position, b.position),
    uv: mix(a.uv, b.uv),
    normal: normal && (length ? normal.map((v) => v / length) : a.normal),
  };
}

export function clipShapePolygon(polygon, signed, positive = true, root) {
  const result = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length];
    const sa = signed(a.position), sb = signed(b.position);
    const insideA = positive ? sa >= 0 : sa <= 0, insideB = positive ? sb >= 0 : sb <= 0;
    if (insideA) result.push(a);
    if (insideA !== insideB) result.push(interpolateShapeVertex(a, b, root ? root(a.position, b.position, sa) : sa / (sa - sb)));
  }
  return result;
}

export function convexShapePlanes(outline) {
  const area = outline.reduce((sum, a, i) => {
    const b = outline[(i + 1) % outline.length];
    return sum + a[0] * b[2] - b[0] * a[2];
  }, 0);
  const sign = area >= 0 ? 1 : -1;
  return outline.flatMap((a, i) => {
    const b = outline[(i + 1) % outline.length], dx = b[0] - a[0], dz = b[2] - a[2];
    const length = Math.hypot(dx, dz);
    return length < 1e-8 ? [] : [(point) => sign * (dz * (point[0] - a[0]) - dx * (point[2] - a[2])) / length];
  });
}

export function convexShapeWallPlanes(bottom, top) {
  const sign = bottom.reduce((sum, a, i) => {
    const b = bottom[(i + 1) % bottom.length];
    return sum + a[0] * b[2] - b[0] * a[2];
  }, 0) >= 0 ? 1 : -1;
  return bottom.flatMap((a, i) => {
    const b = bottom[(i + 1) % bottom.length], tip = top[i];
    const nx = sign * (b[2] - a[2]), nz = -sign * (b[0] - a[0]);
    const ny = -(nx * (tip[0] - a[0]) + nz * (tip[2] - a[2])) / (tip[1] - a[1]);
    const length = Math.hypot(nx, ny, nz);
    return length < 1e-8 ? [] : [(point) => (nx * (point[0] - a[0]) + ny * (point[1] - a[1]) + nz * (point[2] - a[2])) / length];
  });
}

/** Convex subtraction returns the outside pieces plus the common interior. */
export function splitShapeFootprint(polygon, planes) {
  const outside = [];
  let inside = polygon;
  for (const plane of planes) {
    const values = inside.map((v) => plane(v.position));
    if (values.every((v) => v <= 1e-8)) continue;
    if (values.every((v) => v >= 0)) return { outside: [...outside, inside], inside: [] };
    const piece = clipShapePolygon(inside, plane);
    if (piece.length >= 3) outside.push(piece);
    inside = clipShapePolygon(inside, plane, false);
    if (inside.length < 3) break;
  }
  return { outside, inside };
}
