import { Group } from 'three/webgpu';
import { InstanceAnchor } from '../../../stylized/lod/InstanceAnchor.js';
import { writeInstances } from '../../../stylized/lod/StylizedLodRuntime.js';
import { PerfCounters } from '../../../performance/qa/PerfCounters.js';
import { SettlementSurfaceLibrary } from '../surfaces/SettlementSurfaceLibrary.js';
import { SettlementPrototypePool } from './SettlementPrototypePool.js';
import { SettlementSite } from './SettlementSite.js';

export const SETTLEMENT_VIEW = Object.freeze({
  /** Settlements whose edge is within this many metres of the camera are drawn. */
  siteRadius: 520,
  /** Leave margin, so a town on the boundary does not flicker in and out. */
  siteHysteresis: 60,
  maxSites: 3,
  /** Full-detail meshes inside `nearIn`; they hand over to the far tier past `nearOut`. */
  nearIn: 70,
  nearOut: 84,
  /** Street furniture is drawn only this close. */
  smallRange: 95,
  farRange: 620,
  fadeSeconds: 0.35,
  /** Metres the camera may move before levels of detail are re-chosen. */
  reselectMetres: 2,
  refreshMs: 500,
  /** Frames a queued build may be starved of frame budget before it runs anyway. */
  starvationFrames: 8,
});

/**
 * Draws planned settlements: every building and prop of the plans near the
 * camera as instances of pooled workshop meshes, over paved streets.
 *
 * The plan itself is derived, never stored (see SettlementPlanner), so the view
 * holds nothing a save needs. Everything expensive is spread over frames — one
 * mesh variant, or one slice of paving, per frame — and a town fills in around
 * the player, nearest buildings first.
 */
export class SettlementView {
  constructor({ terrainView, baseUrl = '/', enabled = true }) {
    this.terrainView = terrainView;
    this.enabled = enabled;
    this.root = new Group();
    this.root.name = 'settlement-buildings';
    this.pavingRoot = new Group();
    this.pavingRoot.name = 'settlement-paving';
    terrainView.scene.add(this.root, this.pavingRoot);
    this.anchor = new InstanceAnchor();
    this.pool = new SettlementPrototypePool({
      root: this.root,
      renderer: terrainView.renderer,
      // A variant is nine or so new materials; drawn cold they compile in one frame.
      onMeshesCreated: () => terrainView.drawPreparation?.discover(),
    });
    this.library = new SettlementSurfaceLibrary({ renderer: terrainView.renderer, baseUrl });
    this.sites = new Map();
    this.generator = null;
    this.origin = { x: 0, z: 0 };
    this.nextRefresh = 0;
    this.lastTimestamp = null;
    this.selected = { x: Infinity, z: Infinity };
    this.dirty = false;
    this.fading = false;
    this.starved = 0;
    this.rows = new Map();
    this.disposed = false;
  }

  reset() {
    for (const site of this.sites.values()) site.dispose();
    this.sites.clear();
    this.pool.clear();
    this.rows.clear();
    this.nextRefresh = 0;
    this.dirty = true;
  }

  /** Adopt the settlements round `focus` (canonical metres) and drop the ones left behind. */
  refreshSites(focus) {
    const field = this.generator?.ensureSettlementField?.();
    const tileSize = this.terrainView.worldStore.tileSize;
    const near = field
      ? field.entriesNear(focus.x / tileSize, -focus.z / tileSize, (SETTLEMENT_VIEW.siteRadius + SETTLEMENT_VIEW.siteHysteresis) / tileSize)
      : [];
    const keep = new Set();
    for (const { entry, distance } of near) {
      if (keep.size >= SETTLEMENT_VIEW.maxSites) break;
      const id = entry.settlement.id;
      const edge = (distance - entry.reachCells) * tileSize;
      if (!this.sites.has(id) && edge > SETTLEMENT_VIEW.siteRadius) continue;
      keep.add(id);
      if (this.sites.has(id)) continue;
      const site = new SettlementSite({ entry, plan: field.ensurePlan(entry).plan, generator: this.generator, tileSize, library: this.library });
      this.pavingRoot.add(site.paving);
      this.sites.set(id, site);
      this.dirty = true;
    }
    let left = false;
    for (const [id, site] of this.sites) {
      if (keep.has(id)) continue;
      site.dispose();
      this.sites.delete(id);
      left = true;
    }
    if (!left) return;
    // Meshes are pooled per dressing and style; keep the ones a town in view still wears.
    const prefixes = [...this.sites.values()].map((site) => site.poolPrefix);
    this.pool.prune((key) => prefixes.some((prefix) => key.startsWith(prefix)));
    this.dirty = true;
  }

  /** One slice of deferred work: site preparation first, then a mesh variant. */
  advanceWork(shouldYield) {
    if (shouldYield()) {
      this.starved += 1;
      if (this.starved < SETTLEMENT_VIEW.starvationFrames) return;
    }
    this.starved = 0;
    // A starved slice still does one unit, then stops.
    let units = 0;
    const gate = () => units++ > 0 && shouldYield();
    for (const site of this.sites.values()) {
      if (!site.job) continue;
      if (site.advance(gate)) this.dirty = true;
      return;
    }
    if (this.pool.advance()) this.dirty = true;
  }

  /** Choose a tier for every placement and write the instance buffers that changed. */
  select(focus, dt) {
    const fadeStep = dt / SETTLEMENT_VIEW.fadeSeconds;
    for (const rows of this.rows.values()) {
      rows.near.length = 0;
      rows.far.length = 0;
    }
    let fading = false;
    let shown = 0;
    for (const site of this.sites.values()) {
      // Houses are generated in the town's own timber and plaster: wait for them.
      if (!site.surfaces) continue;
      const source = { style: site.plan.profile.style, kind: '', variant: 0, surfaces: site.surfaces };
      for (const placement of site.placements ?? []) {
        const distance = Math.hypot(placement.x - focus.x, placement.z - focus.z);
        const range = placement.small ? SETTLEMENT_VIEW.smallRange : SETTLEMENT_VIEW.farRange;
        if (distance > range + 20 && placement.shown === 0) continue;
        source.kind = placement.kind;
        source.variant = placement.variant;
        const entry = this.pool.request(placement.key, source, distance);
        if (entry.state !== 'ready') continue;
        const wantNear = !entry.far || distance < (placement.blend > 0.5 ? SETTLEMENT_VIEW.nearOut : SETTLEMENT_VIEW.nearIn);
        const wantShown = distance < range;
        const blend = Math.max(0, Math.min(1, placement.blend + (wantNear ? fadeStep : -fadeStep)));
        const visible = Math.max(0, Math.min(1, placement.shown + (wantShown ? fadeStep : -fadeStep)));
        if (blend !== placement.blend || visible !== placement.shown) fading = true;
        placement.blend = blend;
        placement.shown = visible;
        if (visible <= 0) continue;
        let rows = this.rows.get(placement.key);
        if (!rows) {
          rows = { entry, near: [], far: [] };
          this.rows.set(placement.key, rows);
        }
        rows.entry = entry;
        placement.near.fade = visible * blend;
        placement.far.fade = visible * (1 - blend);
        if (placement.near.fade > 0) rows.near.push(placement.near);
        if (placement.far.fade > 0 && entry.far) rows.far.push(placement.far);
        shown += 1;
      }
    }
    this.anchor.follow(this.origin);
    for (const [key, rows] of this.rows) {
      const { entry } = rows;
      if (entry.state !== 'ready') {
        this.rows.delete(key);
        continue;
      }
      writeInstances([this.pool.tier(entry, 'near', rows.near.length).meshes], [rows.near], this.anchor);
      if (entry.far) writeInstances([this.pool.tier(entry, 'far', rows.far.length).meshes], [rows.far], this.anchor);
    }
    PerfCounters.set('settlementInstances', shown);
    return fading;
  }

  /**
   * @param {{ x: number, z: number }} focus what the view is centred on, in canonical metres
   * @param {number} timestamp frame time in milliseconds
   * @param {() => boolean} shouldYield whether this frame's deferred budget is spent
   */
  update(focus, timestamp, shouldYield = () => false) {
    if (this.disposed) return;
    this.root.visible = this.enabled;
    this.pavingRoot.visible = this.enabled;
    if (!this.enabled) return;
    const view = this.terrainView;
    const generator = view.worldStore.generator;
    if (generator !== this.generator) {
      this.generator = generator;
      this.reset();
    }
    const origin = view.floatingOrigin.readState?.(this.origin) ?? Object.assign(this.origin, view.floatingOrigin.getState());
    const dt = this.lastTimestamp === null ? 0 : Math.min(0.1, (timestamp - this.lastTimestamp) / 1000);
    this.lastTimestamp = timestamp;

    if (timestamp >= this.nextRefresh) {
      this.nextRefresh = timestamp + SETTLEMENT_VIEW.refreshMs;
      this.refreshSites(focus);
    }
    if (this.sites.size === 0 && this.rows.size === 0) return;

    const started = performance.now();
    this.advanceWork(shouldYield);
    for (const site of this.sites.values()) {
      // Textures arrive between frames; the first frame that has them re-selects.
      if (site.surfaces && !site.dressed) {
        site.dressed = true;
        this.dirty = true;
      }
      site.installPaving();
      site.paving.position.set(site.centre.x - origin.x, 0, site.centre.z - origin.z);
    }
    const moved = Math.hypot(focus.x - this.selected.x, focus.z - this.selected.z) > SETTLEMENT_VIEW.reselectMetres;
    if (this.dirty || this.fading || moved) {
      this.fading = this.select(focus, dt);
      this.selected.x = focus.x;
      this.selected.z = focus.z;
      this.dirty = false;
    }
    this.anchor.place(this.root, origin);
    PerfCounters.inc('settlementViewCpuMs', performance.now() - started);
  }

  dispose() {
    this.disposed = true;
    this.reset();
    this.pool.dispose();
    this.library.dispose();
    this.root.removeFromParent();
    this.pavingRoot.removeFromParent();
  }
}
