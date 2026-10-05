/** Capture state must be restored even when a shader or device throws. */
export function withReflectionCapture(renderer, scene, hidden, operation) {
  const target = renderer.getRenderTarget();
  const face = renderer.getActiveCubeFace?.() ?? 0;
  const mip = renderer.getActiveMipmapLevel?.() ?? 0;
  const mrt = renderer.getMRT();
  const autoClear = renderer.autoClear;
  const states = hidden.map(object => [object, object.visible]);
  const shadows = [];
  scene.traverse(object => {
    if (object.shadow) {
      shadows.push([object.shadow, object.shadow.autoUpdate, object.shadow.needsUpdate]);
      object.shadow.autoUpdate = false;
      object.shadow.needsUpdate = false;
    }
  });
  for (const [object] of states) object.visible = false;
  renderer.setMRT(null);
  renderer.autoClear = true;
  try { return operation(); }
  finally {
    renderer.setRenderTarget(target, face, mip);
    renderer.setMRT(mrt);
    renderer.autoClear = autoClear;
    for (const [object, visible] of states) object.visible = visible;
    for (const [shadow, update, dirty] of shadows) { shadow.autoUpdate = update; shadow.needsUpdate = dirty; }
  }
}
