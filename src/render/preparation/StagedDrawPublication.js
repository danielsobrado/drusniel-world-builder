import { Group } from 'three/webgpu';

export const WAIT_FOR_DRAW_PREPARATION = 'wait-for-draw-preparation';

/** Prepare new roots in the gameplay passes without exposing a partial scene.
 * The caller owns the detached roots and publishes or disposes them afterward.
 * Explicit material requests preserve skipWarmup's bootstrap-only ownership. */
export function* stagedDrawPublication(parent, roots, preparation) {
  if (!preparation?.settings.enabled) return;
  const stage = new Group();
  stage.name = 'staged-draw-publication';
  stage.visible = false;
  stage.add(...roots);
  parent.add(stage);
  const targets = [];
  try {
    stage.traverse(mesh => {
      if (!mesh.isMesh) return;
      targets.push(mesh);
      preparation.requestMaterial(mesh, mesh.material);
    });
    while (preparation.settings.enabled
      && targets.some(mesh => !preparation.isMaterialReady(mesh, mesh.material))) {
      yield WAIT_FOR_DRAW_PREPARATION;
    }
  } finally {
    for (const root of roots) root.removeFromParent();
    stage.removeFromParent();
  }
}
