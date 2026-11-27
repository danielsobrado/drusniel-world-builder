const preparations = new WeakMap();
const meshRenderers = new WeakMap();
const computeDraws = new WeakMap();

export function isDirectInstanceMesh(mesh) {
  return mesh?.isInstancedMesh === true && mesh.instanceMatrix?.isStorageInstancedBufferAttribute === true;
}

export function bindInitialInstancePreparation(renderer, preparation) {
  preparations.set(renderer, preparation);
  return () => { if (preparations.get(renderer) === preparation) preparations.delete(renderer); };
}

export function trackInitialInstanceMesh(mesh, renderer) {
  if (renderer && isDirectInstanceMesh(mesh)) meshRenderers.set(mesh, renderer);
}

export function trackInitialComputeDraw(mesh, renderer, draw) {
  if (renderer && mesh && draw) {
    meshRenderers.set(mesh, renderer);
    computeDraws.set(mesh, draw);
  }
}

export function initialComputeDraw(mesh) {
  return computeDraws.get(mesh);
}

export function isDormantInitialDraw(mesh) {
  return isDirectInstanceMesh(mesh) ? mesh.count === 0 : initialComputeDraw(mesh)?.isDormant() === true;
}

export function registerInitialInstanceDraw(mesh) {
  preparations.get(meshRenderers.get(mesh))?.registerInitialInstance(mesh);
}

export function acquireInitialInstanceHandoff(mesh) {
  return preparations.get(meshRenderers.get(mesh))?.acquireInitialInstanceHandoff(mesh) ?? null;
}

export function cancelInitialInstanceDraw(mesh) {
  preparations.get(meshRenderers.get(mesh))?.cancel(mesh);
  meshRenderers.delete(mesh);
  computeDraws.delete(mesh);
}
