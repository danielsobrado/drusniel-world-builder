import { Box3, Frustum, Matrix4, Vector3 } from 'three/webgpu';
import { PerfCounters } from '../performance/qa/PerfCounters.js';

function coordinates(v) { return [v.x, v.y, v.z]; }

/** Conservative portal reachability; uncertainty restores normal visibility. */
export class LocationPortalVisibility {
  constructor(scene, graph, settings, grid) {
    this.graph = graph;
    this.settings = settings;
    this.grid = grid;
    this.entries = [];
    this.byMesh = new WeakMap();
    this.hidden = new Set();
    this.reachable = new Uint8Array(graph.count);
    this.connected = new Uint8Array(graph.count);
    this.frustum = new Frustum();
    this.matrix = new Matrix4();
    this.position = new Vector3();
    this.corner = new Vector3();
    this.valid = false;
    scene.updateMatrixWorld(true);
    scene.traverse(mesh => {
      if (!mesh.userData?.locationStructure || !mesh.geometry || !mesh.frustumCulled || mesh.castShadow
          || mesh.material?.transparent || mesh.material?.transmission || Array.isArray(mesh.material)) return;
      mesh.geometry.computeBoundingBox();
      const bounds = new Box3().copy(mesh.geometry.boundingBox).applyMatrix4(mesh.matrixWorld);
      const ids = graph.cellsFor(coordinates(bounds.min), coordinates(bounds.max));
      if (!ids?.length) return;
      const entry = { mesh, ids, world: mesh.matrixWorld.clone() };
      this.entries.push(entry);
      this.byMesh.set(mesh, entry);
    });
    PerfCounters.set('locationPortal.cells', graph.count);
    PerfCounters.set('locationPortal.portals', graph.portalCount);
  }

  restore() {
    for (const mesh of this.hidden) mesh.visible = true;
    this.hidden.clear();
  }

  failOpen() {
    this.valid = false;
    this.restore();
    PerfCounters.set('locationPortal.reachableCells', this.graph.count);
    PerfCounters.set('locationPortal.rejectedSections', 0);
    PerfCounters.set('locationPortal.hiddenSections', 0);
  }

  isHidden(mesh) { return this.valid && this.hidden.has(mesh); }

  canPrefetch(mesh) {
    const entry = this.byMesh.get(mesh);
    return !this.valid || !entry || entry.ids.some(id => this.connected[id] !== 0);
  }

  update(camera) {
    if (!camera.isPerspectiveCamera || camera.view?.enabled || camera.filmOffset || !(camera.near > 0)
        || !Number.isFinite(camera.aspect) || !Number.isFinite(camera.fov) || !(camera.zoom > 0)) {
      this.failOpen();
      return;
    }
    camera.updateWorldMatrix(true, false);
    this.position.setFromMatrixPosition(camera.matrixWorld);
    const world = camera.matrixWorld.elements;
    if (![0, 4, 8].every(i => Math.abs(Math.hypot(world[i], world[i + 1], world[i + 2]) - 1) < 1e-6)) {
      this.failOpen();
      return;
    }
    const p = coordinates(this.position);
    const spread = Math.tan(camera.fov * Math.PI / 360) / camera.zoom;
    const radius = camera.near * Math.hypot(1, spread, spread * camera.aspect) + this.grid.voxel;
    const seeds = this.graph.cellsFor(p.map(v => v - radius), p.map(v => v + radius));
    if (!seeds?.length || !(this.grid.sample(...p) > 0)) {
      this.failOpen();
      return;
    }
    this.matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    if (!this.matrix.elements.every(Number.isFinite)) {
      this.failOpen();
      return;
    }
    this.frustum.setFromProjectionMatrix(this.matrix, camera.coordinateSystem, camera.reversedDepth);
    // Only side planes: rays may cross a portal before reaching the near plane.
    const count = this.graph.reachable(seeds, this.reachable, bounds => {
      for (let i = 0; i < 4; i++) {
        const plane = this.frustum.planes[i], n = plane.normal;
        this.corner.set(n.x >= 0 ? bounds.max[0] : bounds.min[0],
          n.y >= 0 ? bounds.max[1] : bounds.min[1], n.z >= 0 ? bounds.max[2] : bounds.min[2]);
        if (plane.distanceToPoint(this.corner) < -this.grid.voxel) return false;
      }
      return true;
    });
    this.graph.reachable(seeds, this.connected);
    this.valid = true;
    let rejected = 0;
    for (const entry of this.entries) {
      const { mesh, ids, world } = entry;
      mesh.updateWorldMatrix(true, false);
      if (!mesh.matrixWorld.equals(world)) {
        this.failOpen();
        return;
      }
      const visible = ids.some(id => this.reachable[id] !== 0);
      if (!visible) rejected++;
      if (this.settings.portalCull && !visible && mesh.visible) {
        mesh.visible = false;
        this.hidden.add(mesh);
      } else if (visible && this.hidden.delete(mesh)) {
        mesh.visible = true;
      }
    }
    PerfCounters.set('locationPortal.reachableCells', count);
    PerfCounters.set('locationPortal.rejectedSections', rejected);
    PerfCounters.set('locationPortal.hiddenSections', this.hidden.size);
  }

  dispose() {
    this.restore();
    this.valid = false;
    this.entries.length = 0;
    for (const key of ['cells', 'portals', 'reachableCells', 'rejectedSections', 'hiddenSections']) {
      PerfCounters.set(`locationPortal.${key}`, 0);
    }
  }
}
