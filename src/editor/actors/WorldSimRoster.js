import { resolveAssetUrl } from '../assets/assetUrl.js';

export const WORLD_SIM_SCHEMA = 'drusniel-world-sim-game-export';
export const WORLD_SIM_VERSION = 1;

const fetchJson = url => fetch(url).then(response => (response.ok ? response.json() : null));

/**
 * The World Simulator's named people (`world-simulator`, its game export), per settlement.
 * Nothing loads at startup: the small index is fetched the first time a settlement is in
 * range, and a settlement's file when the player approaches it. Until it arrives, and for
 * a settlement the export does not cover, residents stay the cosmetic ones.
 *
 * Settlements join on the Azgaar burg number (`settlement.id` here, `sourceId` there).
 */
export class WorldSimRoster {
  constructor({ baseUrl, settings, load = fetchJson }) {
    Object.assign(this, { baseUrl, settings, load });
    this.index = undefined;          // undefined: not asked; null: no usable export; object once loaded
    this.files = new Map();          // sourceId -> document, or a pending promise, or null
    this.revision = 0;               // bumps when anything arrives, so callers rebuild what they cached
    this.warned = false;
  }
  url(name) {
    return resolveAssetUrl(this.baseUrl, `${this.settings.path.replace(/\/$/, '')}/${name}`);
  }
  usable(document) {
    if (document?.schema === WORLD_SIM_SCHEMA && document.version === WORLD_SIM_VERSION) return true;
    if (document && !this.warned) { this.warned = true; console.warn('World Simulator export has an unknown schema or version; ignored.'); }
    return false;
  }
  arrive(task, apply) {
    task.catch(() => null).then(value => { apply(value); this.revision++; });
  }
  /** The settlement's document when loaded; starts loading it otherwise. */
  settlement(sourceId) {
    if (!this.settings.enabled) return null;
    if (this.index === undefined) {
      this.index = null;            // asked once: a missing export leaves the cosmetic residents for the session
      this.arrive(this.load(this.url('index.json')), value => { this.index = this.usable(value) ? value : null; });
      return null;
    }
    if (!this.index) return null;
    const known = this.files.get(sourceId);
    if (known !== undefined) return known instanceof Promise ? null : known;
    const listed = this.index.settlements.find(entry => entry.sourceId === sourceId);
    if (!listed) { this.files.set(sourceId, null); return null; }
    const task = this.load(this.url(listed.file));
    this.files.set(sourceId, task);
    this.arrive(task, value => {
      if (this.files.get(sourceId) !== task) return;      // dropped while loading
      this.files.set(sourceId, this.usable(value) && value.sourceId === sourceId ? value : null);
    });
    return null;
  }
  /** Keeps only the settlements still in range, so travelling the world cannot grow the cache. */
  retain(sourceIds) {
    for (const id of this.files.keys()) if (!sourceIds.has(id)) this.files.delete(id);
  }
}
