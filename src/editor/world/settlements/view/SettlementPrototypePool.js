import { createInstancedRenderers, disposeInstancedRenderers } from '../../../stylized/lod/StylizedLodRuntime.js';
import { createProceduralObjectLodParts } from '../../../workshop/ProceduralAssetManager.js';
import { createProceduralWorkshopComponentParts } from '../../../workshop/ProceduralWorkshopComponentParts.js';
import { withWorkshopSurfaceOverrides } from '../../../workshop/ProceduralWorkshopSurfaceOverrides.js';
import { buildingRecipe } from '../SettlementBuildingCatalog.js';

/** Material families that still read as a house from across the town. */
const HOUSE_FAR_SLOTS = Object.freeze(['mortar', 'roof', 'recess']);
const MIN_CAPACITY = 8;

function slotOf(part) {
  return part.material?.userData?.workshopSlot;
}

/**
 * The far tier of one pooled mesh.
 *
 * A house's near mesh is already split by material family, so its far tier is
 * simply the plastered shell, the roof and the dark openings — no second
 * generation pass. Masonry (walls, towers, keeps) is nearly all individual
 * stones, so it takes the workshop's own shell tier, which swells the mortar
 * core out to the stone face. Returns null when the mesh has no cheaper form.
 */
function farParts(recipe, nearParts) {
  if (recipe.archetype === 'house') {
    const kept = nearParts.filter((part) => HOUSE_FAR_SLOTS.includes(slotOf(part)));
    return kept.length > 0 && kept.length < nearParts.length ? { parts: kept, owned: [] } : null;
  }
  if (recipe.archetype === 'prop') return null;
  const lod = createProceduralObjectLodParts({ recipe }, nearParts, {});
  if (!lod) return null;
  const owned = [...new Set([...lod.coarse, ...lod.shell])];
  return { parts: lod.shell, owned };
}

/**
 * The meshes a settlement style needs, built on demand and shared by every
 * placement: one instanced renderer set per pooled variant and tier.
 *
 * Generating a house takes ~0.1 s of main-thread time, so `advance` builds at
 * most one variant a call and the view simply draws what exists so far.
 */
export class SettlementPrototypePool {
  constructor({ root, renderer }) {
    this.root = root;
    this.renderer = renderer;
    this.entries = new Map();
    this.queue = [];
  }

  /**
   * Ask for a pooled variant, dressed in `surfaces` (the timber and plaster sets
   * of the town asking). `key` must already tell two dressings apart. Idempotent;
   * the nearest requests are built first.
   */
  request(key, { style, kind, variant, surfaces }, priority) {
    let entry = this.entries.get(key);
    if (!entry) {
      entry = { key, style, kind, variant, surfaces, priority, state: 'queued', near: null, far: null, failed: null };
      this.entries.set(key, entry);
      this.queue.push(entry);
    } else if (priority < entry.priority) {
      entry.priority = priority;
    }
    return entry;
  }

  get(key) {
    const entry = this.entries.get(key);
    return entry?.state === 'ready' ? entry : null;
  }

  get pending() {
    return this.queue.length;
  }

  /** Builds the most wanted queued variant, if any. Returns whether one was built. */
  advance() {
    if (this.queue.length === 0) return false;
    this.queue.sort((left, right) => right.priority - left.priority);
    const entry = this.queue.pop();
    try {
      this.build(entry);
      entry.state = 'ready';
    } catch (error) {
      // One recipe the generator refuses must not empty the town.
      entry.state = 'failed';
      entry.failed = error;
      console.warn(`Settlement variant ${entry.key} could not be generated.`, error);
    }
    return true;
  }

  build(entry) {
    const recipe = buildingRecipe(entry.style, entry.kind, entry.variant);
    const nearParts = withWorkshopSurfaceOverrides(entry.surfaces, () => createProceduralWorkshopComponentParts(recipe));
    let far = null;
    try {
      far = farParts(recipe, nearParts);
      entry.near = this.createTier(entry, 'near', nearParts, MIN_CAPACITY, true);
      // Far buildings keep their shadows: a town without them floats.
      entry.far = far ? this.createTier(entry, 'far', far.parts, MIN_CAPACITY, true) : null;
    } finally {
      // The instanced renderers hold their own geometry copies; the sources are
      // done. Materials and textures stay: the renderers' materials share them.
      for (const part of new Set([...nearParts, ...(far?.owned ?? [])])) part.geometry.dispose();
    }
  }

  createTier(entry, tier, parts, capacity, castShadow) {
    const baked = parts.map((part) => ({ geometry: part.geometry.clone().applyMatrix4(part.matrix), material: part.material }));
    try {
      const [meshes] = createInstancedRenderers({
        root: this.root,
        renderer: this.renderer,
        partsByPrototype: [baked],
        capacity,
        name: `settlement-${entry.key}-${tier}`,
        castShadow,
      });
      return { meshes, capacity, castShadow, name: `settlement-${entry.key}-${tier}`, materials: baked.map((part) => part.material) };
    } finally {
      for (const part of baked) part.geometry.dispose();
    }
  }

  /**
   * The instanced meshes of one tier, grown to hold `count` instances. Growing
   * re-creates the renderers from their own geometry, so a second town of the
   * same style costs a buffer, not a regeneration.
   */
  tier(entry, name, count) {
    const tier = entry[name];
    if (!tier || count <= tier.capacity) return tier;
    let capacity = tier.capacity;
    while (capacity < count) capacity *= 2;
    const sources = tier.meshes.map((mesh, index) => ({ geometry: mesh.geometry, material: tier.materials[index] }));
    const [meshes] = createInstancedRenderers({
      root: this.root,
      renderer: this.renderer,
      partsByPrototype: [sources],
      capacity,
      name: tier.name,
      castShadow: tier.castShadow,
    });
    disposeInstancedRenderers(this.root, [tier.meshes]);
    tier.meshes = meshes;
    tier.capacity = capacity;
    return tier;
  }

  release(entry) {
    for (const tier of [entry.near, entry.far]) if (tier) disposeInstancedRenderers(this.root, [tier.meshes]);
    entry.near = null;
    entry.far = null;
    this.entries.delete(entry.key);
  }

  /** Drop every variant whose key `keep` rejects: the meshes of towns left behind. */
  prune(keep) {
    for (const entry of [...this.entries.values()]) if (!keep(entry.key)) this.release(entry);
    this.queue = this.queue.filter((entry) => this.entries.has(entry.key));
  }

  dispose() {
    this.prune(() => false);
  }
}
