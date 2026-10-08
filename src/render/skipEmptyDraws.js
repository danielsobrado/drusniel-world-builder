const installations = new WeakMap();

/** GPU indirect counts belong to the GPU and must never be inferred from CPU attributes. */
export function isEmptyInstancedDraw(object, geometry) {
  if (geometry?.indirect) return false;
  if (object.isInstancedMesh) return object.count === 0;
  return geometry?.isInstancedBufferGeometry === true && geometry.instanceCount === 0;
}

/** grass-test's empty-draw skip, scoped to one renderer and restored on disposal. */
export function installEmptyDrawSkip(renderer) {
  let state = installations.get(renderer);
  if (!state) {
    const original = renderer.renderObject;
    if (typeof original !== 'function') return { dispose() {} };
    const skipping = function (object, scene, camera, geometry, ...rest) {
      if (isEmptyInstancedDraw(object, geometry)) return;
      return original.call(this, object, scene, camera, geometry, ...rest);
    };
    state = { original, skipping, users: 0 };
    renderer.renderObject = skipping;
    installations.set(renderer, state);
  }
  state.users++;
  let disposed = false;
  return { dispose() {
    if (disposed) return;
    disposed = true;
    if (--state.users > 0) return;
    if (renderer.renderObject === state.skipping) renderer.renderObject = state.original;
    installations.delete(renderer);
  } };
}
