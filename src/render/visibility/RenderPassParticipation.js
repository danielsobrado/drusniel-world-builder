/** Producers opt in explicitly; unknown geometry participates in every applicable pass. */
export function markTransientRenderObject(object) {
  object.userData.excludeFromReflection = true;
  object.userData.excludeFromOcclusion = true;
  return object;
}

export function excludesReflection(object, kind) {
  return object.userData?.excludeFromReflection === true
    || (kind === 'cube' && object.userData?.excludeFromCubeReflection === true);
}

export function appendReflectionExclusions(registry, hidden, kind) {
  const seen = new Set(hidden);
  let excluded = 0;
  const append = object => {
    if (!object.visible || seen.has(object) || !excludesReflection(object, kind)) return;
    seen.add(object);
    hidden.push(object);
    excluded++;
  };
  for (const object of registry.reflectionExclusions) append(object);
  if (kind === 'cube') for (const object of registry.cubeReflectionExclusions) append(object);
  return excluded;
}

/** A shader-generated particle bound is not an honest occlusion candidate. */
export function skipsOcclusionCollection(object) {
  if (object.userData?.excludeFromOcclusion === true) return true;
  if (object.geometry?.indirect || object.isBatchedMesh) return true;
  if (object.isInstancedMesh && object.count === 0) return true;
  if (object.geometry?.isInstancedBufferGeometry && object.geometry.instanceCount === 0) return true;
  return object.geometry?.drawRange?.count === 0;
}

export function visibleBranch(object) {
  for (let node = object; node; node = node.parent) if (!node.visible) return false;
  return true;
}
