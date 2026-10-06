import { MEADOW_TILES_PER_PAGE, MeadowBandBatch } from './MeadowBandBatch.js';

/** Keep tile assignments stable and bound the buffers affected by an update. */
class MeadowBandPages {
  constructor(options) {
    this.options = options;
    this.stride = Math.max(1, options.template.instanceCount);
    this.slots = new Map();
    this.present = new Set();
    this.pages = [];
    this.addPage();
  }

  addPage() {
    const page = new MeadowBandBatch({ ...this.options,
      name: `${this.options.name}-${this.pages.length}` });
    page.members = [];
    page.memberCount = 0;
    this.pages.push(page);
    return page;
  }

  update(tiles) {
    this.present.clear();
    for (const tile of tiles) this.present.add(tile);
    for (const [tile, page] of this.slots) {
      if (this.present.has(tile)) continue;
      page.memberCount -= 1;
      this.slots.delete(tile);
    }
    for (const page of this.pages) page.members.length = 0;
    for (const tile of tiles) {
      let page = this.slots.get(tile);
      if (!page) {
        page = this.pages.find(candidate => candidate.memberCount < MEADOW_TILES_PER_PAGE)
          ?? this.addPage();
        this.slots.set(tile, page);
        page.memberCount += 1;
      }
      page.members.push(tile);
    }
    let stems = 0;
    for (const page of this.pages) stems += page.update(page.members);
    return stems;
  }

  get meshes() {
    return this.pages.map(page => page.mesh);
  }

  get slotCapacity() {
    return this.pages.reduce((sum, page) => sum + page.slotCapacity, 0);
  }

  dispose() {
    for (const page of this.pages) page.dispose();
    this.pages.length = 0;
    this.slots.clear();
  }
}

/** The batches for every band of one template family. */
export class MeadowGrassBatches {
  /**
   * @param {object} options
   * @param {THREE.Object3D} options.scene
   * @param {Record<string, THREE.InstancedBufferGeometry>} options.templates band → template
   * @param {THREE.Material} options.material
   * @param {string} options.name
   * @param {number} [options.renderOrder]
   */
  constructor({ scene, templates, material, name, renderOrder = 0 }) {
    this.batches = new Map();
    this.members = new Map();
    for (const [band, template] of Object.entries(templates)) {
      this.batches.set(band, new MeadowBandPages({ scene, template, material, name: `${name}-${band}`, renderOrder }));
      this.members.set(band, []);
    }
  }

  begin() {
    for (const list of this.members.values()) list.length = 0;
  }

  add(band, tile) {
    this.members.get(band)?.push(tile);
  }

  /** @returns {Record<string, number>} stems drawn per band */
  commit() {
    const stems = {};
    for (const [band, batch] of this.batches) stems[band] = batch.update(this.members.get(band));
    return stems;
  }

  get meshes() {
    return [...this.batches.values()].flatMap((batch) => batch.meshes);
  }

  dispose() {
    for (const batch of this.batches.values()) batch.dispose();
    this.batches.clear();
    this.members.clear();
  }
}
