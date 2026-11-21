import * as THREE from 'three/webgpu';
import { CellResidency, CELL_PENDING } from '../lod/CellResidency.js';
import { InstanceAnchor } from '../lod/InstanceAnchor.js';
import { createGlacierSeracGeometry, GLACIER_SERAC_KINDS } from './glacierSeracGeometry.js';
import { createGlacierSeracMaterial } from './GlacierSeracMaterial.js';

const SERAC_CELL_METERS = 38;
const REACH_CELLS = 6;
const CELLS_PER_FRAME = 8;
const CAPACITY = 120;
const HIGH_ALPINE_ICE_HEIGHT = 1080;
const SLOPE_STEP = 3;
const UP = new THREE.Vector3(0, 1, 0);
const scratch = new THREE.Object3D();
const tiltNormal = new THREE.Vector3();
const spinQuat = new THREE.Quaternion();

function cellHash(cx, cz, salt) {
  let h = Math.imul(cx, 0x9e3779b1) ^ Math.imul(cz, 0x85ebca6b) ^ Math.imul(salt, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

/**
 * Instanced translucent glacial ice seracs, crevasse fins & pressure ridges on
 * Biome 11 (glacier) and high alpine ice slopes (> 880 m). Zero cost in lowlands:
 * meshes are not even instantiated until a glacier/ice cell enters residency.
 */
export class GlacierSeracView {
  constructor({ scene, terrainView, glacierByTile = [], seaLevel = 0, sunDirection = null, pathClearance = null }) {
    this.terrainView = terrainView;
    this.floatingOrigin = terrainView.floatingOrigin;
    this.glacierByTile = glacierByTile;
    this.seaLevel = seaLevel;
    this.sunDirection = sunDirection;
    this.pathClearance = pathClearance;
    this.root = new THREE.Group();
    this.root.name = 'glacier-seracs';
    scene.add(this.root);
    this.anchor = new InstanceAnchor();
    this.meshes = [];
    this.residency = new CellResidency({
      cellMeters: SERAC_CELL_METERS,
      reachCells: REACH_CELLS,
      cellsPerFrame: CELLS_PER_FRAME,
    });
    this.resolve = (cx, cz) => this.resolveCell(cx, cz);
  }

  sampleGround(x, z) {
    const view = this.terrainView;
    const height = view.getCanonicalHeight(x, z);
    const tileSize = view.worldStore.tileSize;
    const tile = view.worldStore.getTile(Math.floor(x / tileSize), Math.floor(-z / tileSize));
    const roadTileId = view.roadTileId ?? this.pathClearance?.roadTileId;
    const isRoad = roadTileId !== undefined && tile === roadTileId;
    const glacierShare = this.glacierByTile[tile] ?? 0;
    const eligible = !isRoad && height > this.seaLevel + 2 && (glacierShare >= 0.4 || height >= HIGH_ALPINE_ICE_HEIGHT);
    if (!eligible) return { eligible: false, height, slope: 0, dx: 0, dz: 0, glacierShare: 0 };
    const dx = (view.getCanonicalHeight(x + SLOPE_STEP, z) - height) / SLOPE_STEP;
    const dz = (view.getCanonicalHeight(x, z + SLOPE_STEP) - height) / SLOPE_STEP;
    return { eligible: true, height, slope: Math.hypot(dx, dz), dx, dz, glacierShare };
  }

  resolveCell(cx, cz) {
    const view = this.terrainView;
    const chunkMeters = view.worldStore.chunkSize * view.worldStore.tileSize;
    if (view.preparedPlacement && !view.preparedPlacement.ensureChunk(
      Math.floor((cx + 0.5) * SERAC_CELL_METERS / chunkMeters),
      Math.floor(-(cz + 0.5) * SERAC_CELL_METERS / chunkMeters),
      1,
      0,
    )) return CELL_PENDING;

    const roll = cellHash(cx, cz, 1);
    if (roll > 0.34) return null;
    const x = (cx + 0.15 + 0.7 * cellHash(cx, cz, 2)) * SERAC_CELL_METERS;
    const z = (cz + 0.15 + 0.7 * cellHash(cx, cz, 3)) * SERAC_CELL_METERS;
    const g = this.sampleGround(x, z);
    if (!g.eligible) return null;
    // On non-glacier high alpine slopes, place seracs only on very steep ice ridges/cirques.
    if (g.glacierShare < 0.4 && g.slope < 0.44) return null;

    const count = g.glacierShare >= 0.4 && cellHash(cx, cz, 4) < 0.48 ? 2 : 1;
    const items = [];
    for (let i = 0; i < count; i += 1) {
      const ox = i === 0 ? 0 : (cellHash(cx, cz, 10 + i) - 0.5) * 8;
      const oz = i === 0 ? 0 : (cellHash(cx, cz, 20 + i) - 0.5) * 8;
      const px = x + ox;
      const pz = z + oz;
      const scale = 1.6 + cellHash(cx, cz, 30 + i) ** 1.7 * 3.1;
      if (this.pathClearance?.blocks(px, pz, scale * 0.9)) continue;
      const sample = i === 0 ? g : this.sampleGround(px, pz);
      if (!sample.eligible) continue;
      items.push({
        x: px,
        y: sample.height - scale * 0.26,
        z: pz,
        dx: sample.dx,
        dz: sample.dz,
        scale,
        stretch: 0.85 + cellHash(cx, cz, 40 + i) * 0.65,
        yaw: cellHash(cx, cz, 50 + i) * Math.PI * 2,
        kind: Math.floor(cellHash(cx, cz, 60 + i) * GLACIER_SERAC_KINDS),
        seed: cellHash(cx, cz, 70 + i),
      });
    }
    return items.length ? items : null;
  }

  ensureMeshes() {
    if (this.meshes.length) return;
    const material = createGlacierSeracMaterial({ sunDirection: this.sunDirection });
    for (let kind = 0; kind < GLACIER_SERAC_KINDS; kind += 1) {
      const geometry = createGlacierSeracGeometry(kind);
      geometry.setAttribute('instanceSeed', new THREE.InstancedBufferAttribute(new Float32Array(CAPACITY), 1));
      const mesh = new THREE.InstancedMesh(geometry, material, CAPACITY);
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.castShadow = true;
      mesh.receiveShadow = false;
      mesh.renderOrder = 4;
      this.root.add(mesh);
      this.meshes.push(mesh);
      this.terrainView.drawPreparation?.register(mesh);
    }
  }

  write() {
    this.anchor.follow(this.floatingOrigin.getState());
    const seracs = this.residency.values().flat();
    if (seracs.length) this.ensureMeshes();
    for (const mesh of this.meshes) mesh.count = 0;
    for (const item of seracs) {
      const mesh = this.meshes[item.kind];
      if (!mesh || mesh.count >= CAPACITY) continue;
      scratch.position.set(item.x - this.anchor.x, item.y, item.z - this.anchor.z);
      tiltNormal.set(-item.dx * 0.35, 1, -item.dz * 0.35).normalize();
      scratch.quaternion.setFromUnitVectors(UP, tiltNormal).multiply(spinQuat.setFromAxisAngle(UP, item.yaw));
      scratch.scale.set(item.scale, item.scale * item.stretch, item.scale);
      scratch.updateMatrix();
      mesh.setMatrixAt(mesh.count, scratch.matrix);
      mesh.geometry.attributes.instanceSeed.setX(mesh.count, item.seed);
      mesh.count += 1;
    }
    for (const mesh of this.meshes) {
      mesh.instanceMatrix.needsUpdate = true;
      mesh.geometry.attributes.instanceSeed.needsUpdate = true;
    }
  }

  update(cameraWorld, shouldYield = () => false) {
    this.residency.refocus(cameraWorld.x, cameraWorld.z);
    if (this.residency.step(this.resolve, shouldYield)) this.write();
    this.anchor.place(this.root, this.floatingOrigin.getState());
  }

  dispose() {
    this.root.removeFromParent();
    for (const mesh of this.meshes) {
      mesh.geometry.dispose();
      mesh.dispose();
    }
    this.meshes[0]?.material.dispose();
  }
}
