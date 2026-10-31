import { TownLayoutBuilder } from './TownLayout.js';
import { TOWN_LOD_DEFAULTS, TOWN_LOD_NEAR, needsRefresh, selectTownLod, townEdgeDistance, townSplits } from './TownLod.js';
import { TownMesh } from './TownMesh.js';
import { stagedDrawPublication, WAIT_FOR_DRAW_PREPARATION } from '../../render/preparation/StagedDrawPublication.js';
import { PerfCounters } from '../performance/qa/PerfCounters.js';
import { settlementPreparationFor } from '../world/settlements/SettlementPreparation.js';

/**
 * Streams the Azgaar burgs around the viewer into the scene.
 *
 * Plans come from the shared asynchronous preparation service (the same plans the
 * terrain grades its pads and paints its streets from), so a town stands exactly
 * where its burg is on the map and on the ground the terrain flattened for it.
 * Towns load inside `loadRadius`, at most one per frame, and unload past
 * `unloadRadius`; each registers its walls, floors, stairs and closed doors with
 * the town collision source while resident. Each frame every resident town
 * picks its kit level of detail from the viewer's distance to its edge, and a
 * near town keeps its interiors (floors, stairs, furniture) to the viewer's
 * surroundings, re-picked every few metres of movement. A population-sized city
 * (TownLod.townSplits) instead draws the near kit round the viewer and the far kit
 * beyond, re-picked the same way.
 */
export class TownStreamer {
  constructor({
    scene,
    getGenerator,
    getWorldStore,
    tileSize,
    floatingOrigin,
    assets,
    palette,
    collisionSource,
    sampleSnow = null,
    getDrawPreparation = () => null,
    loadRadius = 650,
    unloadRadius = 900,
    queryIntervalMs = 700,
    lod = TOWN_LOD_DEFAULTS,
  }) {
    this.scene = scene;
    this.getGenerator = getGenerator;
    this.getWorldStore = getWorldStore;
    this.tileSize = tileSize;
    this.floatingOrigin = floatingOrigin;
    this.assets = assets;
    this.palette = palette;
    this.collisionSource = collisionSource;
    this.sampleSnow = sampleSnow;
    this.getDrawPreparation = getDrawPreparation;
    this.loadRadius = loadRadius;
    this.unloadRadius = unloadRadius;
    this.queryIntervalMs = queryIntervalMs;
    this.lod = lod;
    this.towns = new Map();
    this.pending = new Map();
    this.generator = null;
    this.nextQueryAt = 0;
    this.buildJob = null;
    this.buildErrors = new Map();
    this.stats = { resident: 0, instances: 0, colliders: 0, buildMs: 0, buildLatencyMs: 0 };
  }

  update(nowMs, focus, budget = null) {
    this.focus = focus;
    const generator = this.getGenerator();
    if (generator !== this.generator) {
      this.clear();
      this.generator = generator;
    }
    if (!generator?.ensureSettlementField || !focus) return;
    this.prepareField(generator);
    const advancePlans = () => this.preparation.plans.advance(budget?.shouldYield ?? (() => false));
    if (!budget || !budget.shouldYield()) (budget?.runner ?? (run => run()))(advancePlans);
    if (nowMs >= this.nextQueryAt) {
      this.nextQueryAt = nowMs + this.queryIntervalMs;
      this.refresh(generator, focus);
    }
    const select = () => this.updateLods(focus, budget?.shouldYield);
    (budget?.runner ?? (run => run()))(select);
    if (this.pending.size === 0 && !this.buildJob) return;
    if (!this.assets.ready) {
      this.assets.ensure();
      return;
    }
    const work = () => this.buildNearest(generator, focus, budget?.shouldYield);
    if (!budget || !budget.shouldYield()) (budget?.runner ?? (run => run()))(work);
  }

  refresh(generator, focus) {
    if (this.buildJob && this.distanceTo(this.buildJob.entry.settlement, focus)
        > this.unloadRadius + (this.buildJob.entry.plan.profile?.reach ?? 0)) this.cancelBuild();
    const cellX = focus.x / this.tileSize;
    const cellZ = -focus.z / this.tileSize;
    const field = this.prepareField(generator);
    const plans = this.preparation.plans;
    plans.begin(this);
    const near = field?.entriesNear(cellX, cellZ, this.loadRadius / this.tileSize) ?? [];
    for (const { entry, distance } of near) {
      const { settlement } = entry;
      const plan = plans.get(entry, distance * this.tileSize, this);
      if (!plan || this.towns.has(settlement.id) || this.buildJob?.entry.settlement.id === settlement.id
          || this.buildErrors.has(settlement.id)) continue;
      let ready = true;
      for (const { entry: neighbor } of field.entriesNear(settlement.cellX, settlement.cellZ, entry.reachCells)) {
        if (!plans.get(neighbor, this.distanceTo(neighbor.settlement, focus), this) || !neighbor.index) ready = false;
      }
      if (!ready) continue;
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
    const retained = new Set([...this.towns.keys(), ...this.pending.keys()]);
    if (this.buildJob) retained.add(this.buildJob.entry.settlement.id);
    for (const id of retained) {
      const entry = field?.findById(id);
      if (entry) for (const { entry: neighbor } of field.entriesNear(entry.settlement.cellX, entry.settlement.cellZ, entry.reachCells)) {
        plans.get(neighbor, this.distanceTo(neighbor.settlement, focus), this);
      }
    }
    plans.end();
  }

  prepareField(generator) {
    const preparation = settlementPreparationFor(this.getWorldStore());
    if (preparation !== this.preparation) {
      this.preparation?.plans.release(this);
      this.unsubscribePreparation?.();
      this.preparation = preparation;
      this.unsubscribePreparation = preparation.subscribe(() => { this.nextQueryAt = 0; });
    }
    return preparation.field(generator);
  }

  getPreparationStatus() {
    const preparation = this.preparation;
    const pending = this.pending.size + Number(Boolean(this.buildJob))
      + [...this.towns.values()].filter(town => town.selectionJob).length
      + (preparation?.registry.pending ?? 0) + (preparation?.plans.pending ?? 0);
    const errors = [...this.buildErrors.values()].map(error => String(error.message ?? error));
    errors.push(...(preparation?.registry.errors ?? []), ...(preparation?.plans.errors ?? []));
    return { pending, errors, ready: pending === 0 && errors.length === 0 };
  }

  updateLods(focus, shouldYield = () => false) {
    for (const town of this.towns.values()) {
      town.selectionJob ??= this.selection(town, { ...focus });
      while (!shouldYield()) {
        if (town.selectionJob.next().done) { town.selectionJob = null; break; }
      }
      if (shouldYield()) return;
    }
  }

  *selection(town, focus) {
    if (town.split) {
      yield* this.updateSplit(town, focus);
      return;
    }
    const distance = townEdgeDistance(town.layout.anchor, town.reach, focus.x, focus.z);
    const lod = selectTownLod(town.mesh.lod, distance, this.lod);
    if (lod !== town.mesh.lod) town.mesh.setLod(lod);
    if (lod !== TOWN_LOD_NEAR) return;
    const x = focus.x - town.layout.anchor.x;
    const z = focus.z - town.layout.anchor.z;
    if (needsRefresh(town.mesh.interiorCentre, x, z, this.lod.interiorRefresh)) {
      yield* town.mesh.cullInteriorsJob(x, z, this.lod.interiorRadius);
    }
  }

  /** A split town: re-pick the near placements (and the interiors) as the viewer moves. */
  *updateSplit(town, focus) {
    const x = focus.x - town.layout.anchor.x;
    const z = focus.z - town.layout.anchor.z;
    if (needsRefresh(town.mesh.splitCentre, x, z, this.lod.splitRefresh)) {
      yield* town.mesh.splitJob(x, z, this.lod.splitRadius);
    }
    if (needsRefresh(town.mesh.interiorCentre, x, z, this.lod.interiorRefresh)) {
      yield* town.mesh.cullInteriorsJob(x, z, this.lod.interiorRadius);
    }
  }

  /** The resident town nearest `focus` (canonical), as SettlementView.nearestTown reports it, or null. */
  nearestTown(focus) {
    let nearest = null;
    for (const town of this.towns.values()) {
      const distance = Math.hypot(town.layout.anchor.x - focus.x, town.layout.anchor.z - focus.z);
      if (!nearest || distance < nearest.distance) nearest = { distance, radius: town.radius };
    }
    return nearest;
  }

  distanceTo(settlement, focus) {
    return Math.hypot(settlement.cellX * this.tileSize - focus.x, -settlement.cellZ * this.tileSize - focus.z);
  }

  buildNearest(generator = this.generator, focus = this.focus, shouldYield = () => false) {
    if (!focus || !this.assets.ready || (!this.buildJob && this.pending.size === 0)) return;
    if (!this.buildJob) {
      let best = null;
      for (const entry of this.pending.values()) {
        const distance = this.distanceTo(entry.settlement, focus);
        if (!best || distance < best.distance) best = { ...entry, distance };
      }
      this.pending.delete(best.settlement.id);
      this.buildJob = { entry: best, iterator: this.prepareTown(best, generator), mesh: null };
      this.stats.buildMs = 0;
    }
    const started = performance.now();
    try {
      for (;;) {
        const step = this.buildJob.iterator.next();
        if (step.done) { this.buildJob = null; return; }
        if (step.value === WAIT_FOR_DRAW_PREPARATION) return;
        if (shouldYield()) return;
      }
    } catch (error) {
      this.buildErrors.set(this.buildJob.entry.settlement.id, error);
      this.cancelBuild();
      console.warn('Town preparation failed.', error);
    } finally {
      const elapsed = performance.now() - started;
      this.stats.buildMs += elapsed;
      PerfCounters.inc('townPreparationCpuMs', elapsed);
    }
  }

  cancelBuild() {
    this.buildJob?.iterator.return();
    this.buildJob?.mesh?.dispose();
    this.buildJob = null;
  }

  *prepareTown(best, generator) {
    const startedAt = performance.now();
    const layout = yield* new TownLayoutBuilder({
      settlement: best.settlement,
      plan: best.plan,
      tileSize: this.tileSize,
      kit: this.assets.kit,
      sampleHeight: (x, z) => generator.sampleHeight(x / this.tileSize, -z / this.tileSize),
    }).buildJob();
    const climate = this.climateAt(generator, best.settlement);
    const mesh = new TownMesh({ assets: this.assets, palette: this.palette, layout, climate, deferred: true });
    this.buildJob.mesh = mesh;
    yield* mesh.preparation;
    mesh.preparation = null;
    // A city publishes already split, never whole with the near kit for a frame.
    if (townSplits(best.plan.profile?.radius ?? 0, this.lod) && this.focus) {
      yield* mesh.splitJob(this.focus.x - layout.anchor.x, this.focus.z - layout.anchor.z, this.lod.splitRadius);
    }
    mesh.setOrigin(this.floatingOrigin.getState());
    yield* stagedDrawPublication(this.scene, [mesh.group], this.getDrawPreparation());
    const town = {
      id: best.settlement.id,
      layout,
      mesh,
      reach: best.plan.profile?.reach ?? 0,
      radius: best.plan.profile?.radius ?? 0,
      split: townSplits(best.plan.profile?.radius ?? 0, this.lod),
      doorAngles: new Float32Array(layout.doors.length),
      doorTargets: new Float32Array(layout.doors.length),
    };
    const boxes = [...layout.boxes, ...layout.doors.map((door) => door.box)];
    if (this.collisionSource?.setOwnerJob) yield* this.collisionSource.setOwnerJob(this.ownerId(town.id), boxes);
    else this.collisionSource?.setOwner(this.ownerId(town.id), boxes);
    mesh.setOrigin(this.floatingOrigin.getState());
    this.scene.add(mesh.group);
    this.towns.set(town.id, town);
    this.stats.buildLatencyMs = performance.now() - startedAt;
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
    town.selectionJob?.return();
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
    this.preparation?.plans.release(this);
    this.cancelBuild();
    this.buildErrors.clear();
    for (const id of [...this.towns.keys()]) this.unload(id);
    this.pending.clear();
  }

  dispose() {
    this.clear();
    this.unsubscribePreparation?.();
  }
}
