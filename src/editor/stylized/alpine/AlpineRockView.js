import * as THREE from 'three/webgpu';
import { CELL_PENDING, CellResidency } from '../lod/CellResidency.js';
import { InstanceDirtySpan, admitInstancePublication } from '../lod/InstanceDirtySpan.js';
import { GeologyLodBatches } from '../lod/GeologyLodBatches.js';
import { InstanceAnchor } from '../lod/InstanceAnchor.js';
import { createPathClearanceField } from '../TreeManifestStore.js';
import { ALPINE_CELL_METERS, ALPINE_ROCK_KINDS, alpineRocksInCell } from './alpineRockField.js';
import { createAlpineRockGeometry } from './alpineRockGeometry.js';
import { createAlpineRockMaterial } from './AlpineRockMaterial.js';

/** Inside the near terrain: past it the far mesh is too coarse to stand a rock on. */
const REACH_CELLS = 7;
const CELLS_PER_FRAME = 10;
const CAPACITY = 220;
/** Ground below this height needs a snowy or craggy biome (biome-looks `crags`) to grow these. */
const ALPINE_HEIGHT = 550;
const COLD_GROUND_SNOW = 0.5;
const SLOPE_STEP_METERS = 3;
/** Share of a rock's height left in the ground, so it breaks out rather than sits on it. */
const BURIAL = 0.35;
const UP = new THREE.Vector3(0, 1, 0);
/** Snow on a crag where neither its biome nor its height carries any: none. */
const NO_SNOW_BAND = Object.freeze({ snowLine: Infinity, snowFade: 1 });
const scratch = new THREE.Object3D();
const normal = new THREE.Vector3();
const spin = new THREE.Quaternion();

/** Crags and boulder clusters round the player: one instanced draw per shape, nothing until one is near. */
export class AlpineRockView {
  constructor({
    scene,
    terrainView,
    snowGroundByTile,
    cragsByTile = [],
    seaLevel,
    snowBand = NO_SNOW_BAND,
    config = null,
    pathClearance = null,
  }) {
    this.terrainView = terrainView;
    this.floatingOrigin = terrainView.floatingOrigin;
    this.snowGroundByTile = snowGroundByTile;
    this.cragsByTile = cragsByTile;
    this.seaLevel = seaLevel;
    this.snowBand = snowBand;
    this.pathClearance = pathClearance
      ?? (config && terrainView?.tileMap ? createPathClearanceField(terrainView, config) : null);
    this.root = new THREE.Group();
    this.root.name = 'alpine-rocks';
    scene.add(this.root);
    this.anchor = new InstanceAnchor();
    this.meshes = [];
    this.lodBatches = new GeologyLodBatches({ enabled: config?.enhancements?.geologyLod, kinds: ALPINE_ROCK_KINDS, cellMeters: ALPINE_CELL_METERS });
    this.publicationPending = false;
    this.residency = new CellResidency({ cellMeters: ALPINE_CELL_METERS, reachCells: REACH_CELLS, cellsPerFrame: CELLS_PER_FRAME, progressive: true });
    this.ground = (x, z) => this.groundAt(x, z);
    this.resolve = (cellX, cellZ) => this.resolveCell(cellX, cellZ);
  }

  groundAt(x, z) {
    const view = this.terrainView;
    const height = view.getCanonicalHeight(x, z);
    const size = view.worldStore.tileSize;
    const tile = view.worldStore.getTile(Math.floor(x / size), Math.floor(-z / size));
    const roadTileId = view.roadTileId ?? this.pathClearance?.roadTileId;
    const isRoad = roadTileId !== undefined && tile === roadTileId;
    const biomeSnow = this.snowGroundByTile[tile] ?? 0;
    const rocky = biomeSnow >= COLD_GROUND_SNOW || this.cragsByTile[tile] === 1;
    const allowed = !isRoad && height > this.seaLevel + 1 && (height >= ALPINE_HEIGHT || rocky);
    if (!allowed) return { allowed, slope: 0, height };
    // The terrain's own two sources (SnowAccumulation): the biome's ground snow and the altitude band.
    const { snowLine, snowFade } = this.snowBand;
    const snow = Math.max(biomeSnow, THREE.MathUtils.smoothstep(height, snowLine, snowLine + snowFade));
    const dx = (view.getCanonicalHeight(x + SLOPE_STEP_METERS, z) - height) / SLOPE_STEP_METERS;
    const dz = (view.getCanonicalHeight(x, z + SLOPE_STEP_METERS) - height) / SLOPE_STEP_METERS;
    return { allowed, slope: Math.hypot(dx, dz), height, dx, dz, snow };
  }

  resolveCell(cellX, cellZ) {
    // The jitter, cluster spread and slope taps fit inside this cell plus one page.
    // Never let decorative rocks trigger the generator's synchronous water fields.
    const view = this.terrainView;
    const chunkMeters = view.worldStore.chunkSize * view.worldStore.tileSize;
    if (view.preparedPlacement && !view.preparedPlacement.ensureChunk(
      Math.floor((cellX + 0.5) * ALPINE_CELL_METERS / chunkMeters),
      Math.floor(-(cellZ + 0.5) * ALPINE_CELL_METERS / chunkMeters), 1, 0,
    )) return CELL_PENDING;
    const rocks = alpineRocksInCell(cellX, cellZ, this.ground);
    if (!rocks) return null;
    const kept = [];
    for (const rock of rocks) {
      if (this.pathClearance?.blocks(rock.x, rock.z, rock.scale * 0.85)) continue;
      const ground = this.groundAt(rock.x, rock.z);
      if (!ground.allowed) continue;
      rock.y = ground.height;
      rock.dx = ground.dx ?? 0;
      rock.dz = ground.dz ?? 0;
      rock.snow = ground.snow ?? 0;
      kept.push(rock);
    }
    return kept.length ? kept : null;
  }

  ensureMeshes() {
    if (this.meshes.length) return;
    const material = createAlpineRockMaterial();
    const farGeometries = new Map();
    for (let batch = 0; batch < this.lodBatches.count; batch++) {
      const kind = this.lodBatches.kind(batch);
      const far = this.lodBatches.isFarBatch(batch);
      let geometry;
      if (far && farGeometries.has(kind)) geometry = farGeometries.get(kind).clone();
      else {
        geometry = createAlpineRockGeometry(kind, far);
        if (far) farGeometries.set(kind, geometry);
      }
      geometry.setAttribute('instanceSnow', new THREE.InstancedBufferAttribute(new Float32Array(CAPACITY), 1));
      const mesh = new THREE.InstancedMesh(geometry, material, CAPACITY);
      mesh.count = 0;
      mesh.frustumCulled = true;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.root.add(mesh);
      this.meshes.push(mesh);
      this.terrainView.drawPreparation?.register(mesh);
    }
  }

  write(publicationBudget = null) {
    const rocks = this.residency.values().flat();
    if (!admitInstancePublication(publicationBudget, this.lodBatches.count, CAPACITY, 17)) return false;
    this.anchor.follow(this.floatingOrigin.getState());
    if (rocks.length) this.ensureMeshes();
    const dirty = this.meshes.map(mesh => ({ matrix: new InstanceDirtySpan(mesh.instanceMatrix), snow: new InstanceDirtySpan(mesh.geometry.attributes.instanceSnow) }));
    for (const mesh of this.meshes) mesh.count = 0;
    const kindCounts = new Uint32Array(ALPINE_ROCK_KINDS);
    for (const rock of rocks) {
      if (kindCounts[rock.kind] >= CAPACITY) continue;
      const batch = this.lodBatches.index(rock);
      const mesh = this.meshes[batch];
      if (mesh.count >= CAPACITY) continue;
      scratch.position.set(rock.x - this.anchor.x, rock.y + rock.scale * rock.stretch * (0.5 - BURIAL), rock.z - this.anchor.z);
      // Half way to the slope: crags lean with the mountain without lying flat on it.
      normal.set(-rock.dx * 0.5, 1, -rock.dz * 0.5).normalize();
      scratch.quaternion.setFromUnitVectors(UP, normal).multiply(spin.setFromAxisAngle(UP, rock.yaw));
      scratch.scale.set(rock.scale, rock.scale * rock.stretch, rock.scale);
      scratch.updateMatrix();
      const range = dirty[batch];
      range.matrix.matrix(mesh.count, scratch.matrix);
      range.snow.scalar(mesh.count, rock.snow);
      mesh.count += 1;
      kindCounts[rock.kind]++;
    }
    for (const range of dirty) { range.matrix.publish(); range.snow.publish(); }
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
    for (const mesh of this.meshes) {
      mesh.geometry.dispose();
      mesh.dispose();
    }
    this.meshes[0]?.material.dispose();
  }
}
