import { ShapeUtils, Vector2 } from 'three/webgpu';

/** Triangulate a horizontal polygon, including concavities and holes, with attached UVs. */
export function addShapePolygonSurface(mesh, rings, y, tint, primitive) {
  const clean = rings.map(ring => {
    const result = ring.map(p => [...p]);
    if (result.length > 1 && result[0].every((v, k) => v === result.at(-1)[k])) result.pop();
    return result;
  });
  if (clean[0].length < 3) return;
  const all = clean.flat(), angle = (primitive?.rotation ?? 0) * Math.PI / 180;
  const uv = ([x, z]) => {
    x -= primitive?.position[0] ?? 0; z -= primitive?.position[1] ?? 0;
    return [x * Math.cos(angle) + z * Math.sin(angle), -x * Math.sin(angle) + z * Math.cos(angle)];
  };
  for (const indices of ShapeUtils.triangulateShape(clean[0].map(p => new Vector2(...p)), clean.slice(1).map(r => r.map(p => new Vector2(...p))))) {
    let triangle = indices.map(i => all[i]);
    const [a, b, c] = triangle;
    if ((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]) > 0) triangle = triangle.toReversed();
    mesh.triangle(...triangle.map(([x, z]) => [x, y, z]), tint, triangle.map(uv));
  }
}
