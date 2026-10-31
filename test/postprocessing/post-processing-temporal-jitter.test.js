import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three/webgpu';
import { PostProcessingFrameState } from '../../src/render/postprocessing/PostProcessingFrameState.js';
import { TAA_HALTON_JITTER_PIXELS } from '../../src/render/postprocessing/nodes/TaaResolveNode.js';

const WIDTH = 1280;
const HEIGHT = 720;
const SAMPLES = 8;
const resources = { width: WIDTH, height: HEIGHT, pixelRatio: 1 };
const settings = { antiAliasing: { enabled: true, mode: 'traa', jitterSamples: SAMPLES } };

function placed(camera) {
  camera.position.set(40, 300, 120);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
  return camera;
}

// Points along one line of sight, so only a depth-dependent error can part them.
function worldPoints(camera) {
  return [20, 150, 900, 2400].map((depth) => new THREE.Vector3(30, -12, -depth).applyMatrix4(camera.matrixWorld));
}

for (const [name, create] of [
  ['orthographic', () => new THREE.OrthographicCamera(-160, 160, 90, -90, 0.1, 5000)],
  ['perspective', () => new THREE.PerspectiveCamera(60, WIDTH / HEIGHT, 0.5, 5000)],
]) {
  test(`${name} jitter moves every depth by exactly the sample, in every sample`, () => {
    const camera = placed(create());
    const points = worldPoints(camera);
    const stable = camera.projectionMatrix.clone();
    const rest = points.map((point) => point.clone().project(camera));
    const frameState = new PostProcessingFrameState();
    const history = { jitterIndex: 0 };
    for (let sample = 0; sample < SAMPLES; sample += 1) {
      frameState.beginFrame(camera, resources, history, settings);
      const [jitterX, jitterY] = TAA_HALTON_JITTER_PIXELS[sample];
      for (const [index, point] of points.entries()) {
        const moved = point.clone().project(camera);
        // Compared in pixels: the shift the resolve expects, at every depth.
        assert.ok(Math.abs((moved.x - rest[index].x) * WIDTH / 2 + jitterX) < 1e-3);
        assert.ok(Math.abs((moved.y - rest[index].y) * HEIGHT / 2 + jitterY) < 1e-3);
      }
      frameState.restoreCameraProjection();
      assert.deepEqual(camera.projectionMatrix.elements, stable.elements);
    }
  });
}
