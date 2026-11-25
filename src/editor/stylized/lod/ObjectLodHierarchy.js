import { projectedPixelHeightAt, selectLodBand } from './projectedLod.js';
import { PerfCounters } from '../../performance/qa/PerfCounters.js';

const AXES = ['x', 'y', 'z'];
const DEFAULT_LEAF_SIZE = 16;

function stableBand(state) {
  return state?.complete ? state.target : null;
}

function bounds(placements) {
  const min = { x: Infinity, y: Infinity, z: Infinity }, max = { x: -Infinity, y: -Infinity, z: -Infinity };
  let minHeight = Infinity, maxHeight = -Infinity, valid = true;
  for (const placement of placements) {
    const { worldPosition: p, worldHeight: h } = placement;
    if (!Number.isFinite(h) || h <= 0 || AXES.some(axis => !Number.isFinite(p[axis]))) valid = false;
    minHeight = Math.min(minHeight, h); maxHeight = Math.max(maxHeight, h);
    for (const axis of AXES) {
      min[axis] = Math.min(min[axis], p[axis]);
      max[axis] = Math.max(max[axis], p[axis]);
    }
  }
  return { min, max, minHeight, maxHeight, valid };
}

function stableAcrossBounds(node, camera, viewportHeight, thresholds, scratch) {
  if (!node.valid || !node.band) return false;
  const { min, max, minHeight, maxHeight } = node;
  const { near, far } = scratch;
  for (const axis of AXES) {
    const p = camera.position[axis];
    near[axis] = Math.max(min[axis], Math.min(max[axis], p));
    far[axis] = Math.abs(p - min[axis]) > Math.abs(p - max[axis]) ? min[axis] : max[axis];
  }
  const low = projectedPixelHeightAt(camera, far, minHeight, viewportHeight);
  const high = projectedPixelHeightAt(camera, near, maxHeight, viewportHeight);
  // A margin prevents a floating-point boundary from changing an exact classification.
  const lower = Math.max(0, low - Math.abs(low) * 1e-10);
  const upper = high + Math.abs(high) * 1e-10;
  return Number.isFinite(lower) && Number.isFinite(upper)
    && selectLodBand(lower, node.band, thresholds, thresholds.hysteresisRatio) === node.band
    && selectLodBand(upper, node.band, thresholds, thresholds.hysteresisRatio) === node.band;
}

/** Conservative spatial hierarchy: skip a subtree only when every member retains its completed band. */
export class ObjectLodHierarchy {
  constructor(placements, states, leafSize = DEFAULT_LEAF_SIZE) {
    this.states = states;
    this.leafSize = Math.max(1, Math.floor(leafSize));
    this.leaves = new Map();
    this.scratch = { near: {}, far: {} };
    this.root = placements.length ? this.build([...placements], null) : null;
  }

  build(placements, parent) {
    const node = { ...bounds(placements), parent, count: placements.length, band: null };
    if (placements.length <= this.leafSize || !node.valid) {
      node.placements = placements;
      for (const placement of placements) this.leaves.set(placement.object.id, node);
    } else {
      const axis = AXES.reduce((a, b) => node.max[b] - node.min[b] > node.max[a] - node.min[a] ? b : a);
      placements.sort((a, b) => a.worldPosition[axis] - b.worldPosition[axis]);
      const middle = Math.floor(placements.length / 2);
      node.children = [this.build(placements.slice(0, middle), node), this.build(placements.slice(middle), node)];
    }
    this.refreshNode(node);
    return node;
  }

  refreshNode(node) {
    const bands = node.children
      ? node.children.map(child => child.band)
      : node.placements.map(p => stableBand(this.states.get(p.object.id)));
    node.band = bands[0] && bands.every(band => band === bands[0]) ? bands[0] : null;
  }

  refresh(ids) {
    const leaves = new Set();
    for (const id of ids) {
      const node = this.leaves.get(id);
      if (node) leaves.add(node);
    }
    for (const leaf of leaves) {
      for (let node = leaf; node; node = node.parent) this.refreshNode(node);
    }
  }

  visit(camera, viewportHeight, thresholds, forcedIds, classify) {
    const forced = new Set();
    for (const id of forcedIds) {
      for (let node = this.leaves.get(id); node; node = node.parent) forced.add(node);
    }
    const visitNode = node => {
      PerfCounters.inc('objectLodHierarchyNodes');
      if (!forced.has(node) && stableAcrossBounds(node, camera, viewportHeight, thresholds, this.scratch)) {
        PerfCounters.inc('objectLodHierarchySkipped', node.count);
        return;
      }
      if (node.children) {
        for (const child of node.children) visitNode(child);
      } else {
        for (const placement of node.placements) classify(placement);
      }
      this.refreshNode(node);
    };
    if (this.root) visitNode(this.root);
  }
}
