function* graphTargets(graph) {
  yield graph.scenePass?.renderTarget;
  yield graph.ambientOcclusion?.aoPass?._aoRenderTarget;
  yield graph.ambientOcclusion?.compositeNode?.renderTarget;
  yield graph.screenSpaceShafts?.radianceNode?.renderTarget;
  yield graph.screenSpaceShafts?.compositeNode?.renderTarget;
  for (const node of graph.hierarchicalDepth?.levels ?? []) yield node?.renderTarget;
  yield graph.ssr?.traceNode?.renderTarget;
  yield graph.ssr?.compositeNode?.renderTarget;
  for (const node of graph.bloom?.targets ?? []) yield node?.renderTarget;
  for (const node of graph.bloom?.upsampleTargets ?? []) yield node?.renderTarget;
  yield graph.depthOfField?.sourceTarget?.renderTarget;
  yield graph.sharpen?.sourceTarget?.renderTarget;
  yield graph.grain?.sourceTarget?.renderTarget;
}

/** Reclamation includes retained graphs; warmup admits only the selected topology. */
export function* surfacePostTargets(surface, settings, activeOnly = false) {
  const post = surface.terrainView.postProcessing;
  if (!settings.surfacePostReclamationEnabled || !post || post.disposed || post.rendererState) return;
  const invalidate = () => post.invalidation.invalidate('RENDER_PATH_CHANGED');
  const resources = post.resources;
  const signature = post.topologySignature;
  const selected = resources.graphs.get(signature);
  if (activeOnly && (!selected || resources.activeSignature !== signature || post.graph !== selected.graph
      || post.isBypassed?.() || post.isCurrentTopologyFailed?.())) return;
  const emit = function* (targets) {
    for (const target of targets ?? []) if (target) yield { target, invalidate };
  };
  for (const record of activeOnly ? [selected] : resources.graphs.values()) {
    if (!record.graph.disposed) yield* emit(graphTargets(record.graph));
  }
  if (activeOnly && selected.graph.disposed) return;
  if (!activeOnly || selected.graph.taaResolve) {
    yield* emit(post.history.taaColourTargets);
    yield* emit(post.history.taaDepthTargets);
  }
  if (!activeOnly || selected.graph.ssr) {
    yield* emit(post.history.ssrColourTargets);
    yield* emit(post.history.ssrDepthTargets);
  }
}
