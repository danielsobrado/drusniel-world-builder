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

test('rotating in place does not rebuild distance-based object LOD', () => {
  const controller = new ObjectLodController({ nearPixels: 1 });
  const placements = [placement(1)];
  controller.seed(placements, 'near', 0);
  const view = camera();
  const first = controller.plan({ placements, camera: view, viewportHeight: 720, timestamp: 0 });
  view.quaternion.y = 0.5;
  view.quaternion.w = Math.sqrt(0.75);
  assert.strictEqual(controller.plan({ placements, camera: view, viewportHeight: 720, timestamp: 100 }), first);
});

test('spatial hierarchy skips stable groups but agrees with exhaustive LOD across boundary crossings', () => {
  const placements = Array.from({ length: 512 }, (_, i) => placement(i + 1, (i % 32) * 40));
  for (let i = 0; i < placements.length; i++) placements[i].worldPosition.z = -30 - Math.floor(i / 32) * 50;
  const fast = new ObjectLodController({ evaluationHz: 144, transitionMs: 20 });
  const reference = new ObjectLodController({ evaluationHz: 144, transitionMs: 20 });
  const view = camera();
  const rows = plan => Object.fromEntries(Object.entries(plan.buckets).map(([band, entries]) => [
    band, entries.map(row => [row.objectId, row.quantizedFade, row.ditherDirection]).sort((a, b) => a[0] - b[0]),
  ]));
  for (let frame = 0; frame < 60; frame++) {
    view.position.x = frame * 15;
    view.position.z = -frame * 5;
    const args = { placements, camera: view, viewportHeight: 720, timestamp: frame * 30,
      selectedObjectId: frame >= 20 && frame < 40 ? 300 : null };
    assert.deepEqual(rows(fast.plan(args)), rows(reference.plan({ ...args, force: true })));
  }
});
