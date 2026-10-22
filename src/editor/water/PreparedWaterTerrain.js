import { resolveWaterDomainConfig } from './WaterConfig.js';

const prepared = new WeakMap();
export const waterPreparationKey = metadata => JSON.stringify([metadata.seed, metadata.version,
  metadata.heightScale, metadata.seaLevel, resolveWaterDomainConfig(metadata.waterDomain)]);

export function preparedWaterTerrain(source, metadata) {
  const result = source && prepared.get(source);
  if (!result) return null;
  return result?.key === waterPreparationKey(metadata) ? result : null;
}

/** Worker results stay derived and out of saved documents and undo payloads. */
export function installPreparedWaterTerrain(source, metadata, result) {
  if (result?.key !== waterPreparationKey(metadata)) throw new Error('Mismatched prepared water terrain.');
  for (const name of ['canonical', 'macro']) {
    const segments = result[name], reaches = result[`${name}Reaches`];
    if (!Array.isArray(segments)) throw new Error('Invalid prepared river segments.');
    if (!Array.isArray(reaches) || reaches.length !== segments.length) throw new Error('Invalid prepared river valleys.');
    for (const [index, segment] of segments.entries()) {
      const p = segment.profile;
      if (!['bodyId', 'ax', 'az', 'bx', 'bz', 'dx', 'dz', 'length', 'flowX', 'flowZ',
        'startSurface', 'endSurface', 'radiusCells', 'channelDepth'].every(key => Number.isFinite(segment[key]))
        || !(segment.length > 0) || !Number.isSafeInteger(p?.steps) || p.steps < 1
        || !(p.levels instanceof Float32Array) || p.levels.length !== p.steps + 1
        || !(p.fallCounts instanceof Uint8Array) || p.fallCounts.length !== p.steps
        || !(p.halfWidths instanceof Float32Array) || p.halfWidths.length !== p.steps
        || !(p.fallSteps instanceof Int32Array) || !(p.stepMeters > 0) || !Number.isFinite(p.plungeScale)
        || !(reaches[index] instanceof Float32Array) || reaches[index].length < 2) {
        throw new Error('Invalid prepared river profile.');
      }
    }
  }
  prepared.set(source, result);
}

export function clonePreparedWaterSource(source) {
  if (!source) return null;
  const clone = structuredClone(source), result = prepared.get(source);
  if (result) prepared.set(clone, result);
  return clone;
}

export function releasePreparedWaterTerrain(source) { prepared.delete(source); }
