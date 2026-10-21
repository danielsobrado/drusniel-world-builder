import * as THREE from 'three/webgpu';
import {
  SETTLEMENT_ROLE_FALLBACK,
  SETTLEMENT_SURFACE_ROLES,
  SETTLEMENT_SURFACE_SETS,
  surfaceSetFiles,
  surfaceSetRecipe,
} from './SettlementDressing.js';

const MAP_COLOR_SPACE = Object.freeze({ color: THREE.SRGBColorSpace, normal: THREE.NoColorSpace, arm: THREE.NoColorSpace });

function configure(texture, colorSpace, repeat = 1) {
  texture.colorSpace = colorSpace;
  texture.repeat.set(repeat, repeat);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = 16;
  // One GPU copy serves every material that samples the set (see modelParts).
  texture.userData.sharedSurface = true;
  return texture;
}

/**
 * The surface sets on the GPU, made on demand and counted.
 *
 * A town asks for its dressing as it comes into range: its sets are made in
 * parallel — photographed ones loaded, procedural ones generated from their
 * recipe — a set two towns share is made once, and a set no town in view still
 * wears is released. Nothing here runs at startup; the procedural baker, and
 * the PTL runtime behind it, are not even fetched until a town wants them.
 */
export class SettlementSurfaceLibrary {
  constructor({ renderer, baseUrl = '/', loader = new THREE.TextureLoader() } = {}) {
    this.renderer = renderer;
    this.base = baseUrl.replace(/\/?$/, '/');
    this.root = `${this.base}assets/textures/settlement/`;
    this.loader = loader;
    this.sets = new Map();
    this.baker = null;
    this.disposed = false;
  }

  async loadPhotographed(name, config) {
    const maps = {};
    const loaded = await Promise.allSettled(Object.entries(surfaceSetFiles(name)).map(async ([map, file]) => {
      maps[map] = configure(await this.loader.loadAsync(this.root + file), MAP_COLOR_SPACE[map], config.repeat);
    }));
    const failed = loaded.find(result => result.status === 'rejected');
    if (failed) {
      Object.values(maps).forEach(map => map.dispose());
      throw failed.reason;
    }
    return Object.freeze({
      name,
      tileMetres: config.tileMetres,
      ...maps,
      dispose: () => Object.values(maps).forEach((map) => map.dispose()),
    });
  }

  async generateProcedural(name, config) {
    const [response, { SettlementProceduralBaker }] = await Promise.all([
      fetch(this.base + surfaceSetRecipe(name)),
      import('./SettlementProceduralBaker.js'),
    ]);
    if (!response.ok) throw new Error(`Settlement surface recipe ${name} answered ${response.status}.`);
    const recipe = await response.json();
    if (this.disposed) throw new Error('Settlement surface library was disposed.');
    this.baker ??= new SettlementProceduralBaker(this.renderer);
    return this.baker.bake(recipe, { name, ...config });
  }

  acquireSet(name) {
    if (this.disposed) throw new Error('Settlement surface library was disposed.');
    let entry = this.sets.get(name);
    if (!entry) {
      const config = SETTLEMENT_SURFACE_SETS[name];
      if (!config) throw new Error(`Unknown settlement surface set: ${name}.`);
      entry = { uses: 0, loading: config.ptl ? this.generateProcedural(name, config) : this.loadPhotographed(name, config) };
      this.sets.set(name, entry);
    }
    entry.uses += 1;
    return entry.loading;
  }

  releaseSet(name) {
    const entry = this.sets.get(name);
    if (!entry || --entry.uses > 0) return;
    this.sets.delete(name);
    // A set released while it is being made still resolves; free it once it has.
    entry.loading.then((set) => set.dispose(), () => {});
  }

  /** One role's set, or the role's photographed fallback if its own cannot be made. */
  async acquireRole(role, name, lease) {
    lease.names.push(name);
    try {
      return await this.acquireSet(name);
    } catch (error) {
      const fallback = SETTLEMENT_ROLE_FALLBACK[role];
      if (name === fallback || lease.released || this.disposed) throw error;
      console.warn(`Settlement surface ${name} could not be made; using ${fallback}.`, error);
      lease.names.push(fallback);
      return this.acquireSet(fallback);
    }
  }

  /**
   * Every set of a dressing, made in parallel. Resolves to the sets by role and
   * the `release` that gives exactly those back.
   */
  acquire(dressing) {
    const lease = { names: [], released: false };
    const release = () => {
      if (lease.released) return;
      lease.released = true;
      lease.names.splice(0).forEach(name => this.releaseSet(name));
    };
    const surfaces = Promise.all(SETTLEMENT_SURFACE_ROLES.map((role) => this.acquireRole(role, dressing[role], lease)))
      .then((sets) => Object.freeze(Object.fromEntries(SETTLEMENT_SURFACE_ROLES.map((role, index) => [role, sets[index]]))))
      .catch(error => { release(); throw error; });
    return { surfaces, release };
  }

  dispose() {
    this.disposed = true;
    for (const name of [...this.sets.keys()]) {
      this.sets.get(name).uses = 1;
      this.releaseSet(name);
    }
    this.baker?.dispose();
    this.baker = null;
  }
}
