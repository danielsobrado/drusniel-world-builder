import { BufferAttribute, Box3, Sphere, Vector3 } from 'three/webgpu';

/** Same Float32 accumulation and normalization as Three.computeVertexNormals. */
export function* prepareSurfaceJob(arrays, computeNormals = false) {
  const position = new BufferAttribute(arrays.positions, 3);
  if (computeNormals) {
    const normal = new BufferAttribute(new Float32Array(arrays.positions.length), 3);
    const a = new Vector3(), b = new Vector3(), c = new Vector3();
    const na = new Vector3(), nb = new Vector3(), nc = new Vector3();
    const cb = new Vector3(), ab = new Vector3();
    const indices = arrays.indices;
    for (let i = 0; i < indices.length; i += 3) {
      const ia = indices[i], ib = indices[i + 1], ic = indices[i + 2];
      a.fromBufferAttribute(position, ia); b.fromBufferAttribute(position, ib); c.fromBufferAttribute(position, ic);
      cb.subVectors(c, b); ab.subVectors(a, b); cb.cross(ab);
      na.fromBufferAttribute(normal, ia).add(cb);
      nb.fromBufferAttribute(normal, ib).add(cb);
      nc.fromBufferAttribute(normal, ic).add(cb);
      normal.setXYZ(ia, na.x, na.y, na.z); normal.setXYZ(ib, nb.x, nb.y, nb.z); normal.setXYZ(ic, nc.x, nc.y, nc.z);
      if (i % 768 === 765) yield;
    }
    for (let i = 0; i < normal.count; i++) {
      na.fromBufferAttribute(normal, i).normalize(); normal.setXYZ(i, na.x, na.y, na.z);
      if (i % 256 === 255) yield;
    }
    arrays.normals = normal.array;
  }
  const box = new Box3(), point = new Vector3();
  for (let i = 0; i < position.count; i++) {
    box.expandByPoint(point.fromBufferAttribute(position, i));
    if (i % 256 === 255) yield;
  }
  const sphere = new Sphere(); box.getCenter(sphere.center);
  let radiusSq = 0;
  for (let i = 0; i < position.count; i++) {
    radiusSq = Math.max(radiusSq, sphere.center.distanceToSquared(point.fromBufferAttribute(position, i)));
    if (i % 256 === 255) yield;
  }
  sphere.radius = Math.sqrt(radiusSq);
  arrays.boundingSphere = sphere;
  return arrays;
}
