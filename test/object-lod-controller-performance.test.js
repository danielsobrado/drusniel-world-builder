import assert from 'node:assert/strict';
import test from 'node:test';

import { ObjectLodController } from '../src/editor/ObjectLodController.js';

function placement(id, x = 0) {
  return {
    object: { id },
    matrix: { id },
    worldPosition: { x, y: 0, z: -10 },
    worldHeight: 2,
  };
}

function camera() {
  return {
    position: { x: 0, y: 0, z: 0 },
    quaternion: { x: 0, y: 0, z: 0, w: 1 },
    isOrthographicCamera: false,
    fov: 60,
    zoom: 1,
  };
}

test('object LOD classification is cadence-limited while the camera moves', () => {
  const controller = new ObjectLodController({
    nearPixels: 1,
    coarsePixels: 0.5,
    transitionMs: 240,
    fadeSteps: 16,
    evaluationHz: 30,
  });
  const placements = [placement(1)];
  controller.seed(placements, 'near', 0);
  const view = camera();

  const first = controller.plan({ placements, camera: view, viewportHeight: 720, timestamp: 0 });
  view.position.x = 1;
  const throttled = controller.plan({ placements, camera: view, viewportHeight: 720, timestamp: 10 });
  const refreshed = controller.plan({ placements, camera: view, viewportHeight: 720, timestamp: 40 });

  assert.strictEqual(throttled, first);
  assert.notStrictEqual(refreshed, first);
});

test('selection changes bypass the object LOD cadence', () => {
  const controller = new ObjectLodController({ evaluationHz: 30 });
  const placements = [placement(1)];
  controller.seed(placements, 'shell', 0);
  const view = camera();
  const first = controller.plan({ placements, camera: view, viewportHeight: 720, timestamp: 0 });

  const selected = controller.plan({
    placements,
    camera: view,
    viewportHeight: 720,
    timestamp: 10,
    selectedObjectId: 1,
  });

  assert.notStrictEqual(selected, first);
});
