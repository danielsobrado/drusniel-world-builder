/** Separate a usable proxy fallback from the intended, fully loaded asset set. */
export function treeImpostorIntegrity(view) {
  const settings = view?.config?.lod?.impostor;
  const expected = Boolean(view?.config?.trees?.enabled && settings?.enabled);
  const atlases = view?.impostorAtlases ?? [];
  const prototypeCount = view?.prototypes?.length ?? 0;
  const indices = new Set(atlases.map(atlas => atlas.prototypeIndex));
  const complete = prototypeCount > 0 && atlases.length === prototypeCount
    && indices.size === prototypeCount
    && [...indices].every(index => Number.isInteger(index) && index >= 0 && index < prototypeCount);
  const offline = atlases.every(atlas => atlas.source === 'asset');
  const ready = !expected || (complete && (settings.runtimeBake !== false || offline));
  return {
    ready, expected, prototypeCount, atlasCount: atlases.length,
    batchCount: view?.impostorBatches?.length ?? 0,
    runtimeSignature: view?.prototypeSignature ?? null,
    sources: [...new Set(atlases.map(atlas => atlas.source ?? 'runtime'))],
    failure: ready ? null : view?.impostorFailure ?? 'Tree atlases are incomplete or still loading.',
  };
}
