import {
  projectedPixelHeightAt,
  quantizeFade,
  selectLodBand,
  advanceLodTransition,
} from './stylized/lod/projectedLod.js';
import { InstanceLodRows } from './stylized/lod/InstanceLodRows.js';
import { ObjectLodHierarchy } from './stylized/lod/ObjectLodHierarchy.js';
import { PerfCounters } from './performance/qa/PerfCounters.js';

const SOURCE_TO_OBJECT_BAND = Object.freeze({
  near: 'near',
  proxy: 'coarse',
  impostor: 'shell',
  cluster: 'shell',
  culled: 'culled',
});

const OBJECT_TO_SOURCE_BAND = Object.freeze({
  near: 'near',
  coarse: 'proxy',
  shell: 'impostor',
});

const CAMERA_STATE_SIZE = 8;

function writeCameraState(camera, viewportHeight, target) {
  const position = camera.position;
  target[0] = Math.round(position.x * 2);
  target[1] = Math.round(position.y * 2);
  target[2] = Math.round(position.z * 2);
  target[3] = Math.round((camera.zoom ?? 1) * 10);
  target[4] = Math.round((camera.fov ?? 0) * 10);
  target[5] = Math.round(viewportHeight * 10);
  target[6] = Number(Boolean(camera.isOrthographicCamera));
  target[7] = camera.isOrthographicCamera ? Math.abs(camera.top - camera.bottom) : 0;
}

function cameraStatesEqual(left, right) {
  for (let index = 0; index < CAMERA_STATE_SIZE; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function stableSeed(id) {
  let hash = Math.imul(Number(id) || 1, 0x9e3779b1) >>> 0;
  hash ^= hash >>> 16;
  return (hash >>> 0) / 0xffffffff;
}

export class ObjectLodController {
  constructor({
    nearPixels = 140,
    coarsePixels = 35,
    hysteresisRatio = 0.15,
    transitionMs = 240,
    fadeSteps = 16,
    evaluationHz = 30,
    hierarchyLeafSize = 16,
  } = {}) {
    this.thresholds = {
      nearPixels,
      proxyPixels: coarsePixels,
      impostorPixels: 0,
      clusterPixels: 0,
      hysteresisRatio,
    };
    this.transitionMs = transitionMs;
    this.hierarchyLeafSize = hierarchyLeafSize;
    this.fadeSteps = fadeSteps;
    this.evaluationIntervalMs = 1000 / Math.max(1, evaluationHz);
    this.nextEvaluationAt = 0;
    this.states = new Map();
    this.seeds = new Map();
    this.cameraState = new Float64Array(CAMERA_STATE_SIZE);
    this.lastCameraState = new Float64Array(CAMERA_STATE_SIZE);
    this.hasLastCameraState = false;
    this.lastSelectedObjectId = null;
    this.lastPlan = null;
    this.transitioning = false;
    this.rows = new InstanceLodRows();
    this.placements = new Map();
    this.dirtyIds = new Set();
    this.transitionIds = new Set();
    this.hierarchy = null;
    this.lastPlacementInput = null;
  }

  clear() {
    this.states.clear();
    this.seeds.clear();
    this.nextEvaluationAt = 0;
    this.hasLastCameraState = false;
    this.lastSelectedObjectId = null;
    this.lastPlan = null;
    this.transitioning = false;
    this.rows = new InstanceLodRows();
    this.placements = new Map();
    this.dirtyIds = new Set();
    this.transitionIds = new Set();
    this.hierarchy = null;
    this.lastPlacementInput = null;
  }

  seed(placements, band = 'near', timestamp = 0) {
    const sourceBand = OBJECT_TO_SOURCE_BAND[band] ?? 'near';
    for (const placement of placements) {
      if (this.states.has(placement.object.id)) continue;
      this.states.set(placement.object.id, {
        from: sourceBand,
        target: sourceBand,
        startedAt: timestamp,
        complete: true,
        representations: Object.freeze([Object.freeze({
          band: sourceBand,
          fade: 1,
          ditherDirection: 1,
        })]),
      });
    }
  }

  invalidate() {
    this.hasLastCameraState = false;
    this.nextEvaluationAt = 0;
  }

  /** Retain camera/LOD history; changed placement products invalidate only their IDs. */
  updatePlacements(next) {
    for (const [id, record] of next) if (this.placements.get(id) !== record) this.dirtyIds.add(id);
    for (const id of this.placements.keys()) if (!next.has(id)) this.dirtyIds.add(id);
    if (this.dirtyIds.size) this.hierarchy = null;
    this.placements = next;
    this.seed([...this.dirtyIds].flatMap(id => next.has(id) ? [next.get(id)] : []));
  }

  classify(placement, camera, viewportHeight, timestamp, selectedObjectId) {
    PerfCounters.inc('objectLodPlacementsEvaluated');
    const objectId = placement.object.id;
    const previousState = this.states.get(objectId) ?? null;
    const previousObjectBand = SOURCE_TO_OBJECT_BAND[previousState?.target] ?? null;
    const pixels = projectedPixelHeightAt(camera, placement.worldPosition, placement.worldHeight, viewportHeight);
    const band = objectId === selectedObjectId ? 'near' : SOURCE_TO_OBJECT_BAND[selectLodBand(
      pixels, previousObjectBand ? OBJECT_TO_SOURCE_BAND[previousObjectBand] : null, this.thresholds, this.thresholds.hysteresisRatio,
    )];
    const state = advanceLodTransition(previousState, OBJECT_TO_SOURCE_BAND[band] ?? 'impostor', timestamp, this.transitionMs);
    this.states.set(objectId, state);
    if (state.complete) this.transitionIds.delete(objectId); else this.transitionIds.add(objectId);
    let seed = this.seeds.get(objectId);
    if (seed === undefined) { seed = stableSeed(objectId); this.seeds.set(objectId, seed); }
    return state.representations.map(representation => ({
      band: SOURCE_TO_OBJECT_BAND[representation.band], matrix: placement.matrix,
      fade: representation.fade, ditherDirection: representation.ditherDirection ?? 1,
      quantizedFade: quantizeFade(representation.fade, this.fadeSteps), seed, objectId,
    }));
  }

  plan({ placements, camera, viewportHeight, timestamp, selectedObjectId = null, force = false }) {
    if (placements !== this.lastPlacementInput) {
      const next = new Map(placements.map(p => [p.object.id, p]));
      for (const [id, record] of next) if (this.placements.get(id) !== record) this.dirtyIds.add(id);
      for (const id of this.placements.keys()) if (!next.has(id)) this.dirtyIds.add(id);
      if (this.dirtyIds.size) this.hierarchy = null;
      this.placements = next;
      this.lastPlacementInput = placements;
    }
    writeCameraState(camera, viewportHeight, this.cameraState);
    const cameraUnchanged = this.hasLastCameraState && cameraStatesEqual(this.cameraState, this.lastCameraState);
    const selectionUnchanged = selectedObjectId === this.lastSelectedObjectId;
    if (!force && selectionUnchanged && !this.dirtyIds.size && this.lastPlan) {
      if (!this.transitioning && cameraUnchanged) return this.lastPlan;
      if (Number.isFinite(timestamp) && timestamp < this.nextEvaluationAt) return this.lastPlan;
    }
    if (!force && this.lastPlan && this.hasLastCameraState) {
      const ids = new Set([...this.dirtyIds, ...this.transitionIds]);
      if (selectedObjectId !== null && !selectionUnchanged) ids.add(selectedObjectId);
      if (this.lastSelectedObjectId !== null && !selectionUnchanged) ids.add(this.lastSelectedObjectId);
      const changes = new Map();
      const classify = placement => changes.set(placement.object.id,
        this.classify(placement, camera, viewportHeight, timestamp, selectedObjectId));
      if (cameraUnchanged) {
        for (const id of ids) {
          const placement = this.placements.get(id);
          if (placement) classify(placement);
        }
        this.hierarchy?.refresh(ids);
      } else {
        this.hierarchy ??= new ObjectLodHierarchy(placements, this.states, this.hierarchyLeafSize);
        this.hierarchy.visit(camera, viewportHeight, this.thresholds, ids, classify);
      }
      for (const id of ids) if (!this.placements.has(id)) {
        changes.set(id, []);
        this.states.delete(id); this.seeds.delete(id); this.transitionIds.delete(id);
      }
      this.lastPlan = this.rows.patch(changes, this.transitionIds.size);
    } else {
      const buckets = { near: [], coarse: [], shell: [] };
      for (const placement of placements) for (const row of this.classify(placement, camera, viewportHeight, timestamp, selectedObjectId)) {
        if (buckets[row.band]) buckets[row.band].push(row);
      }
      for (const id of this.states.keys()) if (!this.placements.has(id)) {
        this.states.delete(id); this.seeds.delete(id); this.transitionIds.delete(id);
      }
      this.lastPlan = this.rows.replace(buckets, this.transitionIds.size);
      this.hierarchy = new ObjectLodHierarchy(placements, this.states, this.hierarchyLeafSize);
    }
    this.dirtyIds.clear();
    this.transitioning = this.transitionIds.size > 0;
    this.nextEvaluationAt = Number.isFinite(timestamp) ? timestamp + this.evaluationIntervalMs : 0;
    this.lastCameraState.set(this.cameraState); this.hasLastCameraState = true;
    this.lastSelectedObjectId = selectedObjectId;
    return this.lastPlan;
  }
}
