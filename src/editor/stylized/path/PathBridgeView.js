import * as THREE from 'three/webgpu';
import { CellResidency } from '../lod/CellResidency.js';
import { InstanceAnchor } from '../lod/InstanceAnchor.js';
import {
  BRIDGE_CELL_METERS,
  bridgeDeckHeightAt,
  bridgesInCell,
  createBridgeTerrainSampler,
} from './pathBridgeField.js';
import {
  buildPathBridgesGeometry,
  createPathBridgeMaterial,
} from './pathBridgeGeometry.js';

const MAX_CELL_CACHE = 512;

export class PathBridgeView {
  constructor({
    scene,
    terrainView,
    naturalTrail = null,
    sampler = null,
    cellMeters = BRIDGE_CELL_METERS,
    reachCells = 8,
    cellsPerFrame = 6,
  }) {
    this.scene = scene ?? null;
    this.terrainView = terrainView ?? null;
    this.naturalTrail = naturalTrail;
    this.sampler = sampler ?? createBridgeTerrainSampler(terrainView);
    this.residency = new CellResidency({ cellMeters, reachCells, cellsPerFrame });
    this.cellCache = new Map();
    this.root = new THREE.Group();
    this.root.name = 'path-bridges';
    this.scene?.add(this.root);
    this.material = createPathBridgeMaterial();
    this.mesh = null;
    this.anchor = new InstanceAnchor();
  }

  getTrails() {
    return this.terrainView?.worldStore?.generator?.ensureTrailGrading?.() ?? null;
  }

  resolveCell(cellX, cellZ) {
    const key = `${cellX}:${cellZ}`;
    if (this.cellCache.has(key)) return this.cellCache.get(key);
    const bridges = bridgesInCell(cellX, cellZ, this.sampler, {
      naturalTrail: this.naturalTrail,
      trails: this.getTrails(),
    });
    if (this.cellCache.size >= MAX_CELL_CACHE) {
      this.cellCache.delete(this.cellCache.keys().next().value);
    }
    this.cellCache.set(key, bridges);
    return bridges;
  }

  /**
   * Returns the highest walkable bridge deck elevation at canonical `(worldX, worldZ)`,
   * or `null` when outside every bridge deck.
   */
  deckHeightAt(worldX, worldZ) {
    const step = this.residency.cellMeters;
    const cx = Math.floor(worldX / step);
    const cz = Math.floor(worldZ / step);
    let best = null;
    for (let dz = -1; dz <= 1; dz += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const bridges = this.resolveCell(cx + dx, cz + dz);
        for (const bridge of bridges) {
          const y = bridgeDeckHeightAt(bridge, worldX, worldZ);
          if (y !== null && (best === null || y > best)) best = y;
        }
      }
    }
    return best;
  }

  update(cameraWorld, shouldYield = () => false) {
    if (this.mesh && this.terrainView?.floatingOrigin) {
      this.anchor.place(this.root, this.terrainView.floatingOrigin.getState());
    }
    this.residency.refocus(cameraWorld.x, cameraWorld.z);
    if (this.residency.step((cx, cz) => this.resolveCell(cx, cz), shouldYield)) {
      this.write();
    }
  }

  write() {
    const origin = this.terrainView?.floatingOrigin?.getState?.() ?? { x: 0, z: 0 };
    this.anchor.follow(origin);
    this.anchor.place(this.root, origin);

    if (this.mesh) {
      this.root.remove(this.mesh);
      this.mesh.geometry.dispose();
      this.mesh = null;
    }

    const bridges = [];
    for (const cellBridges of this.residency.values()) {
      for (const b of cellBridges) bridges.push(b);
    }
    if (!bridges.length) return;

    const geometry = buildPathBridgesGeometry(bridges, this.anchor.x ?? 0, this.anchor.z ?? 0);
    if (!geometry) return;

    const mesh = new THREE.Mesh(geometry, this.material);
    mesh.name = 'path-bridges-batch';
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.terrainView?.drawPreparation?.register(mesh);
    this.root.add(mesh);
    this.mesh = mesh;
  }

  invalidate() {
    this.cellCache.clear();
    this.residency.cells.clear();
    this.residency.pending.length = 0;
    this.residency.focusKey = null;
    this.residency.dirty = true;
  }

  dispose() {
    if (this.mesh) {
      this.root.remove(this.mesh);
      this.mesh.geometry.dispose();
      this.mesh = null;
    }
    this.material.dispose();
    this.scene?.remove(this.root);
    this.cellCache.clear();
  }
}
