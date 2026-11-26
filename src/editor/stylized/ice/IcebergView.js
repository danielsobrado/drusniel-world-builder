import * as THREE from 'three/webgpu';
import { CellResidency } from '../lod/CellResidency.js';
import { InstanceDirtySpan, admitInstancePublication } from '../lod/InstanceDirtySpan.js';
import { GeologyLodBatches } from '../lod/GeologyLodBatches.js';
import { InstanceAnchor } from '../lod/InstanceAnchor.js';
import { ICEBERG_CELL_METERS, ICEBERG_KINDS, icebergCandidate, icebergHasRoom } from './icebergField.js';
import { createIcebergGeometry } from './icebergGeometry.js';
import { createIceMaterial } from './IceMaterial.js';

const REACH_CELLS = 6;
const CAPACITY = 48;
/** World queries a frame: each cell asks up to thirty tiles, once. */
const CELLS_PER_FRAME = 6;
const COLD_RINGS_METERS = [300, 900, 1800];
const COLD_DIRECTIONS = 6;
/** Ground snow that makes a shore cold enough to calve: tundra and glacier do. */
const COLD_GROUND_SNOW = 0.5;
const WATER_TILE = 0;
/** Share of the land in reach that must be snow country. */
const COLD_LAND_SHARE = 0.6;
const scratch = new THREE.Object3D();

/** Icebergs off cold coasts: one instanced draw per shape, and nothing built until one is near. */
export class IcebergView {
  constructor({ scene, worldStore, floatingOrigin, seaLevel, sunDirection, snowGroundByTile, seed = 0, getDrawPreparation = () => null, geologyLod = false, geologyAdmission = null }) {
    this.worldStore = worldStore;
    this.floatingOrigin = floatingOrigin;
    this.seaLevel = seaLevel;
    this.sunDirection = sunDirection;
    this.snowGroundByTile = snowGroundByTile;
    this.seed = seed;
    this.getDrawPreparation = getDrawPreparation;
    this.root = new THREE.Group();
    this.root.name = 'icebergs';
    scene.add(this.root);
    this.anchor = new InstanceAnchor();
    this.meshes = [];
    this.lodBatches = new GeologyLodBatches({ enabled: geologyLod, kinds: ICEBERG_KINDS, cellMeters: ICEBERG_CELL_METERS, admission: geologyAdmission });
    this.publicationPending = false;
    this.residency = new CellResidency({ cellMeters: ICEBERG_CELL_METERS, reachCells: REACH_CELLS, cellsPerFrame: CELLS_PER_FRAME, progressive: true });
    this.resolve = (cellX, cellZ) => this.resolveCell(cellX, cellZ);
    this.isSea = (x, z) => this.tileAt(x, z) === WATER_TILE;
  }

  tileAt(x, z) {
    const size = this.worldStore.tileSize;
    // Tile rows run opposite to render z.
    return this.worldStore.getTile(Math.floor(x / size), Math.floor(-z / size));
  }

  /**
   * Most of the land round the berg is snow country. Any one snowy tile in reach
   * was enough before, and a compact world floated bergs off temperate meadows.
   */
  isColdCoast(x, z) {
    let land = 0;
    let cold = 0;
    for (const ring of COLD_RINGS_METERS) {
      for (let i = 0; i < COLD_DIRECTIONS; i += 1) {
        const angle = (i / COLD_DIRECTIONS) * Math.PI * 2;
        const tile = this.tileAt(x + Math.cos(angle) * ring, z + Math.sin(angle) * ring);
        if (tile === WATER_TILE) continue;
        land += 1;
        if ((this.snowGroundByTile[tile] ?? 0) >= COLD_GROUND_SNOW) cold += 1;
      }
    }
    return land > 0 && cold / land >= COLD_LAND_SHARE;
  }

  resolveCell(cellX, cellZ) {
    const candidate = icebergCandidate(cellX, cellZ, this.seed);
    if (!candidate || !icebergHasRoom(candidate, this.isSea) || !this.isColdCoast(candidate.x, candidate.z)) return null;
    return candidate;
  }

  ensureMeshes() {
    if (this.meshes.length) return;
    const material = createIceMaterial({ sunDirection: this.sunDirection, seaLevel: this.seaLevel });
    const farGeometries = new Map();
    for (let batch = 0; batch < this.lodBatches.count; batch++) {
      const kind = this.lodBatches.kind(batch);
      const far = this.lodBatches.isFarBatch(batch);
      let geometry;
      if (far && farGeometries.has(kind)) geometry = farGeometries.get(kind);
      else {
        geometry = createIcebergGeometry(kind, far);
        if (far) farGeometries.set(kind, geometry);
      }
      const mesh = new THREE.InstancedMesh(geometry, material, CAPACITY);
      mesh.count = 0;
      mesh.frustumCulled = true;
      this.root.add(mesh);
      this.meshes.push(mesh);
      this.getDrawPreparation()?.register(mesh);
    }
  }

  write(publicationBudget = null) {
    const bergs = this.residency.values();
    if (!admitInstancePublication(publicationBudget, this.lodBatches.count, CAPACITY, 16)) return false;
    this.anchor.follow(this.floatingOrigin.getState());
    if (bergs.length) this.ensureMeshes();
    this.lodBatches.plan(bergs, this.meshes, CAPACITY);
    const dirty = this.meshes.map(mesh => ({ matrix: new InstanceDirtySpan(mesh.instanceMatrix) }));
    for (const mesh of this.meshes) mesh.count = 0;
    const kindCounts = new Uint32Array(ICEBERG_KINDS);
    for (const berg of bergs) {
      if (kindCounts[berg.kind] >= CAPACITY) continue;
      const batch = this.lodBatches.index(berg);
      const mesh = this.meshes[batch];
      if (mesh.count >= CAPACITY) continue;
      scratch.position.set(berg.x - this.anchor.x, this.seaLevel, berg.z - this.anchor.z);
      scratch.rotation.set(0, berg.yaw, 0);
      scratch.scale.setScalar(berg.scale);
      scratch.updateMatrix();
      const range = dirty[batch];
      range.matrix.matrix(mesh.count, scratch.matrix);
      mesh.count += 1;
      kindCounts[berg.kind]++;
    }
    for (const range of dirty) { range.matrix.publish(); }
    for (const mesh of this.meshes) mesh.computeBoundingSphere();
    return true;
  }

  /** @param {{ x: number, z: number }} cameraWorld canonical metres */
  update(cameraWorld, shouldYield = () => false, publicationBudget = null) {
    if (this.lodBatches.updateFocus(cameraWorld) && this.meshes.length) this.publicationPending = true;
    this.residency.refocus(cameraWorld.x, cameraWorld.z);
    if (this.residency.step(this.resolve, shouldYield)) this.publicationPending = true;
    if (this.publicationPending && !shouldYield() && this.write(publicationBudget)) this.publicationPending = false;
    this.anchor.place(this.root, this.floatingOrigin.getState());
  }

  dispose() {
    this.root.removeFromParent();
    for (const geometry of new Set(this.meshes.map(mesh => mesh.geometry))) geometry.dispose();
    for (const mesh of this.meshes) mesh.dispose();
    this.meshes[0]?.material.dispose();
  }
}
