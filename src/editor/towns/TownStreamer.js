import { layoutTown } from './TownLayout.js';
import { TOWN_LOD_DEFAULTS, TOWN_LOD_NEAR, needsRefresh, selectTownLod, townEdgeDistance } from './TownLod.js';
import { TownMesh } from './TownMesh.js';

/**
 * Streams the Azgaar burgs around the viewer into the scene.
 *
 * Plans come from the world generator (`settlementsNear`, the same plans the
 * terrain grades its pads and paints its streets from), so a town stands exactly
 * where its burg is on the map and on the ground the terrain flattened for it.
 * Towns load inside `loadRadius`, at most one per frame, and unload past
 * `unloadRadius`; each registers its walls, floors, stairs and closed doors with
 * the town collision source while resident. Each frame every resident town
 * picks its kit level of detail from the viewer's distance to its edge, and a
 * near town keeps its interiors (floors, stairs, furniture) to the viewer's
 * surroundings, re-picked every few metres of movement.
 */
export class TownStreamer {
  constructor({
    scene,
    getGenerator,
    tileSize,
    floatingOrigin,
    assets,
    palette,
    collisionSource,
    sampleSnow = null,
    loadRadius = 650,
    unloadRadius = 900,
    queryIntervalMs = 700,
    lod = TOWN_LOD_DEFAULTS,
  }) {
    this.scene = scene;
    this.getGenerator = getGenerator;
    this.tileSize = tileSize;
    this.floatingOrigin = floatingOrigin;
    this.assets = assets;
    this.palette = palette;
    this.collisionSource = collisionSource;
    this.sampleSnow = sampleSnow;
    this.loadRadius = loadRadius;
    this.unloadRadius = unloadRadius;
    this.queryIntervalMs = queryIntervalMs;
    this.lod = lod;
    this.towns = new Map();
    this.pending = new Map();
    this.generator = null;
    this.nextQueryAt = 0;
    this.stats = { resident: 0, instances: 0, colliders: 0, buildMs: 0 };
  }

  update(nowMs, focus) {
    const generator = this.getGenerator();
    if (generator !== this.generator) {
      this.clear();
      this.generator = generator;
    }
    if (!generator?.settlementsNear || !focus) return;
    if (nowMs >= this.nextQueryAt) {
      this.nextQueryAt = nowMs + this.queryIntervalMs;
      this.refresh(generator, focus);
    }
    this.updateLods(focus);
    if (this.pending.size === 0) return;
    if (!this.assets.ready) {
      this.assets.ensure();
      return;
    }
    this.buildNearest(generator, focus);
  }

  refresh(generator, focus) {
    const cellX = focus.x / this.tileSize;
    const cellZ = -focus.z / this.tileSize;
    const near = generator.settlementsNear(cellX, cellZ, this.loadRadius / this.tileSize);
    for (const { settlement, plan } of near) {
      if (!plan || this.towns.has(settlement.id)) continue;
      this.pending.set(settlement.id, { settlement, plan });
    }
    for (const [id, town] of this.towns) {
      const distance = Math.hypot(town.layout.anchor.x - focus.x, town.layout.anchor.z - focus.z);
      if (distance > this.unloadRadius + town.reach) this.unload(id);
    }
    for (const [id, entry] of this.pending) {
      const distance = this.distanceTo(entry.settlement, focus);
      if (distance > this.unloadRadius + (entry.plan.profile?.reach ?? 0)) this.pending.delete(id);
    }
  }

  updateLods(focus) {
    for (const town of this.towns.values()) {
      const distance = townEdgeDistance(town.layout.anchor, town.reach, focus.x, focus.z);
      const lod = selectTownLod(town.mesh.lod, distance, this.lod);
      if (lod !== town.mesh.lod) town.mesh.setLod(lod);
      if (lod !== TOWN_LOD_NEAR) continue;
      const x = focus.x - town.layout.anchor.x;
      const z = focus.z - town.layout.anchor.z;
      if (needsRefresh(town.mesh.interiorCentre, x, z, this.lod.interiorRefresh)) {
        town.mesh.cullInteriors(x, z, this.lod.interiorRadius);
      }
    }
  }

  distanceTo(settlement, focus) {
    return Math.hypot(settlement.cellX * this.tileSize - focus.x, -settlement.cellZ * this.tileSize - focus.z);
  }

  buildNearest(generator, focus) {
    let best = null;
    for (const entry of this.pending.values()) {
      const distance = this.distanceTo(entry.settlement, focus);
      if (!best || distance < best.distance) best = { ...entry, distance };
    }
    this.pending.delete(best.settlement.id);
    const startedAt = performance.now();
    const layout = layoutTown({
      settlement: best.settlement,
      plan: best.plan,
      tileSize: this.tileSize,
      kit: this.assets.kit,
      sampleHeight: (x, z) => generator.sampleHeight(x / this.tileSize, -z / this.tileSize),
    });
    const climate = this.climateAt(generator, best.settlement);
    const mesh = new TownMesh({ assets: this.assets, palette: this.palette, layout, climate });
    mesh.setOrigin(this.floatingOrigin.getState());
    this.scene.add(mesh.group);
    const town = {
      id: best.settlement.id,
      layout,
      mesh,
      reach: best.plan.profile?.reach ?? 0,
      doorAngles: new Float32Array(layout.doors.length),
      doorTargets: new Float32Array(layout.doors.length),
    };
    this.towns.set(town.id, town);
    this.collisionSource?.setOwner(this.ownerId(town.id), [...layout.boxes, ...layout.doors.map((door) => door.box)]);
    this.stats.buildMs = performance.now() - startedAt;
    this.updateStats();
  }

  /** Biome and ground snow at the burg, for its city skin. */
  climateAt(generator, settlement) {
    const biome = generator.sampleBiome?.(Math.floor(settlement.cellX), Math.floor(settlement.cellZ)) ?? null;
    const x = settlement.cellX * this.tileSize;
    const z = -settlement.cellZ * this.tileSize;
    const height = generator.sampleHeight(settlement.cellX, settlement.cellZ);
    let snow = 0;
    try {
      snow = this.sampleSnow?.(x, z, height, biome) ?? 0;
    } catch (error) {
      console.warn('Town snow sampling failed.', error);
    }
    return Object.freeze({ biome, snow });
  }

  ownerId(id) {
    return `town:${id}`;
  }

  unload(id) {
    const town = this.towns.get(id);
    if (!town) return;
    town.mesh.dispose();
    this.collisionSource?.removeOwner(this.ownerId(id));
    this.towns.delete(id);
    this.updateStats();
  }

  rebase() {
    const origin = this.floatingOrigin.getState();
    for (const town of this.towns.values()) town.mesh.setOrigin(origin);
  }

  updateStats() {
    let instances = 0;
    let colliders = 0;
    for (const town of this.towns.values()) {
      instances += town.mesh.instanceCount;
      colliders += town.layout.boxes.length;
    }
    Object.assign(this.stats, { resident: this.towns.size, instances, colliders });
  }

  clear() {
    for (const id of [...this.towns.keys()]) this.unload(id);
    this.pending.clear();
  }

  dispose() {
    this.clear();
  }
}
