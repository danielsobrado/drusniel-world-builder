import { Matrix4, Plane, Vector3, Vector4, WebGPUCoordinateSystem } from 'three/webgpu';

/** Mirrors any editor/player camera, with a WebGPU-aware oblique water clip plane. */
export function preparePlanarCamera(source, height, target = source.clone()) {
  if (target.constructor !== source.constructor) target = source.clone();
  source.updateMatrixWorld();
  target.copy(source, false);
  const position = new Vector3().setFromMatrixPosition(source.matrixWorld);
  const direction = source.getWorldDirection(new Vector3());
  position.y = 2 * height - position.y;
  direction.y *= -1;
  const up = new Vector3(0, 1, 0).transformDirection(source.matrixWorld);
  up.y *= -1;
  target.position.copy(position);
  target.up.copy(up);
  target.lookAt(position.clone().add(direction));
  target.coordinateSystem = source.coordinateSystem;
  target.updateMatrixWorld();
  target.projectionMatrix.copy(source.projectionMatrix);
  // Overscan tolerates camera turns between captures.
  target.projectionMatrix.elements[0] /= 1.25;
  target.projectionMatrix.elements[5] /= 1.15;
  const plane = new Plane(new Vector3(0, 1, 0), -height).applyMatrix4(target.matrixWorldInverse);
  const clip = new Vector4(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
  const q = new Vector4(Math.sign(clip.x), Math.sign(clip.y), 1, 1)
    .applyMatrix4(new Matrix4().copy(target.projectionMatrix).invert());
  const scale = (source.coordinateSystem === WebGPUCoordinateSystem ? 1 : 2) / clip.dot(q);
  clip.multiplyScalar(scale);
  const p = target.projectionMatrix.elements;
  // OpenGL's near boundary is row 3 + row 4. Subtract the actual fourth
  // row, which differs for perspective (z=-1) and orthographic (w=1).
  const gl = source.coordinateSystem !== WebGPUCoordinateSystem;
  p[2] = clip.x - (gl ? p[3] : 0); p[6] = clip.y - (gl ? p[7] : 0);
  p[10] = clip.z - (gl ? p[11] : 0); p[14] = clip.w - (gl ? p[15] : 0);
  target.projectionMatrixInverse.copy(target.projectionMatrix).invert();
  return target;
}
