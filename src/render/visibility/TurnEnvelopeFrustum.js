import { Frustum, Matrix4 } from 'three/webgpu';

function expandedSlope(slope, marginRadians, direction) {
  const angle = Math.atan(slope) + marginRadians * direction;
  return Math.tan(Math.max(-Math.PI / 2 + 0.001, Math.min(Math.PI / 2 - 0.001, angle)));
}

/** Gods' End angular margins, including ultrawide and asymmetric projections. */
export class TurnEnvelopeFrustum {
  constructor() {
    this.frustum = new Frustum();
    this.projectionView = new Matrix4();
    this.expandedProjection = new Matrix4();
  }

  update(camera, marginDegrees = 12) {
    camera.updateMatrixWorld();
    const projection = this.expandedProjection.copy(camera.projectionMatrix);
    const margin = Math.min(45, Math.max(0, Number(marginDegrees) || 0));
    if (margin && camera.isPerspectiveCamera) {
      const e = camera.projectionMatrix.elements, near = camera.near;
      const radians = margin * Math.PI / 180;
      projection.makePerspective(
        expandedSlope((-1 + e[8]) / e[0], radians, -1) * near,
        expandedSlope((1 + e[8]) / e[0], radians, 1) * near,
        expandedSlope((1 + e[9]) / e[5], radians, 1) * near,
        expandedSlope((-1 + e[9]) / e[5], radians, -1) * near,
        near, camera.far, camera.coordinateSystem,
      );
    } else if (margin && camera.isOrthographicCamera) {
      // Preserve the editor's existing conservative orbit envelope, including
      // projection offsets; angular expansion applies to perspective views.
      for (const index of [0, 4, 8, 12, 1, 5, 9, 13]) projection.elements[index] /= 1.25;
    }
    this.projectionView.multiplyMatrices(projection, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.projectionView, camera.coordinateSystem);
    return this.frustum;
  }
}
