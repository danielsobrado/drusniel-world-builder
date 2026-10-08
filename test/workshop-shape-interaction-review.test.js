import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three/webgpu';
import { WorkshopShapeHandles } from '../src/editor/workshop/shapes/WorkshopShapeHandles.js';
import { WorkshopShapeSession } from '../src/editor/workshop/shapes/WorkshopShapeSession.js';
import { shapeFieldLimits } from '../src/editor/workshop/shapes/ShapeEditConstraints.js';

test('field limits represent low walls, tall buildings, and descending traversal', () => {
  assert.deepEqual(shapeFieldLimits({ kind: 'curved-wall' }, 'height'), [0.5, 16]);
  assert.deepEqual(shapeFieldLimits({ kind: 'curved-volume', footprint: { width: 7, depth: 5 } }, 'height'), [1, 24]);
  assert.deepEqual(shapeFieldLimits({ kind: 'traversal', elevation: 12, rise: -3 }, 'rise'), [-8, 8]);
  assert.deepEqual(shapeFieldLimits({ kind: 'traversal', elevation: 12, rise: -3 }, 'elevation'), [3, 32]);
});

test('handles ignore other pointers, clamp wall height, and restore prior orbit state', () => {
  const originalWindow = globalThis.window;
  globalThis.window = new EventTarget();
  const session = new WorkshopShapeSession({ primitives: [{ id: 'wall', kind: 'curved-wall' }] });
  const canvas = new EventTarget();
  canvas.hasPointerCapture = () => false;
  let changed = 0;
  const editor = {
    session,
    get primitive() { return session.getPrimitive('wall'); },
    changed() { changed++; },
    onStatus(message) { assert.fail(message); },
  };
  const controls = { enabled: false };
  const handles = new WorkshopShapeHandles({ canvas, camera: new THREE.PerspectiveCamera(),
    orbitControls: controls, editor, previewRoot: new THREE.Group() });
  const event = (pointerId) => ({ pointerId, stopImmediatePropagation() {}, preventDefault() {} });
  try {
    handles.sync();
    session.begin();
    handles.drag = { primitive: editor.primitive, field: 'height', pointerId: 1,
      point: new THREE.Vector3(), plane: new THREE.Plane(), orbitEnabled: false };
    handles.ray = () => assert.fail('Another pointer must not move the active drag.');
    handles.pointerMove(event(2));
    handles.finish(true, event(2));
    assert.ok(handles.drag);
    assert.equal(changed, 0);
    handles.ray = () => {};
    handles.raycaster.ray.intersectPlane = (_plane, target) => target.set(0, 100, 0);
    handles.pointerMove(event(1));
    assert.equal(editor.primitive.height, 16);
    handles.finish(true, event(1));
    assert.equal(controls.enabled, false);
    assert.equal(session.history.undoDepth, 1);
    session.begin();
    session.update('wall', { height: 5 });
    handles.drag = { pointerId: 3, orbitEnabled: true };
    handles.lostCapture(event(3));
    assert.equal(editor.primitive.height, 16);
    assert.equal(controls.enabled, true);
    assert.equal(handles.drag, null);
  } finally {
    handles.dispose(); session.dispose();
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});
