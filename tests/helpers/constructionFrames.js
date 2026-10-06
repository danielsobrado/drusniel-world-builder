import assert from 'node:assert/strict';

/** Drive the resumable builder to a condition, with a bound that catches stalls. */
export function advanceConstructionFrames(view, {
  camera = null,
  viewportHeight = 600,
  until = () => view.buildQueue.length === 0,
  maxFrames = 10000,
} = {}) {
  // Each call represents a new run of frames, including camera changes that
  // happen inside the LOD refresh interval in a synchronous test.
  view.nextLodEvaluationAt = 0;
  for (let frame = 0; frame < maxFrames; frame += 1) {
    view.update();
    if (camera) view.updateLod(camera, viewportHeight);
    if (until()) {
      // Preview handoff observes the finished publication on the next frame.
      view.update();
      return;
    }
  }
  assert.fail(`Construction did not settle within ${maxFrames} frames`);
}
