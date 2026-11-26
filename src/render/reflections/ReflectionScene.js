/** Each auxiliary view has its own vegetation selection and billboard uniforms. */
export function withAuxiliaryScene(surface, camera, origin, timestamp, operation) {
  let draw = operation;
  for (const view of surface.detailViews ?? []) if (view.visibility) {
    const next = draw; draw = () => view.visibility.withAuxiliaryCamera
      ? view.visibility.withAuxiliaryCamera(camera, next) : view.visibility.withFull(next);
  }
  for (const batch of surface.treeView?.impostorBatches ?? []) {
    if (!batch) continue;
    const next = draw; draw = () => batch.withCamera(camera, origin, timestamp, next);
  }
  return draw();
}
