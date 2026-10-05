import { Matrix4 } from 'three/webgpu';
import { cameraPosition, float, max, positionWorld, smoothstep, uniform, vec2, vec3, vec4 } from 'three/tsl';

/** Gods' End cached reflection sampling, owned by one capture controller. */
export class PlanarReprojection {
  constructor() {
    this.viewProjection = uniform(new Matrix4());
    this.perspective = uniform(1);
    this.valid = uniform(0);
  }

  record(virtualCamera) {
    this.viewProjection.value.multiplyMatrices(virtualCamera.projectionMatrix, virtualCamera.matrixWorldInverse);
    this.perspective.value = virtualCamera.isPerspectiveCamera ? 1 : 0;
    this.valid.value = 1;
  }

  uvNode() {
    // A direction (w=0) ignores capture translation and preserves rotation
    // between refreshes. Projecting the nearby water point shears the image.
    // Orthographic orbit cameras need positional projection instead.
    const ray = positionWorld.sub(cameraPosition).mul(vec3(1, -1, 1));
    const input = this.perspective.greaterThan(0.5).select(vec4(ray, 0), vec4(positionWorld, 1));
    const clip = this.viewProjection.mul(input);
    const ndc = clip.xy.div(clip.w.max(1e-4));
    const uv = vec2(ndc.x.mul(0.5).add(0.5), float(0.5).sub(ndc.y.mul(0.5)));
    const outside = uv.sub(1).max(uv.negate()).max(0);
    const weight = float(1).sub(smoothstep(0.04, 0.3, max(outside.x, outside.y)))
      .mul(clip.w.greaterThan(0).select(1, 0)).mul(this.valid);
    return { uv, weight };
  }
}
