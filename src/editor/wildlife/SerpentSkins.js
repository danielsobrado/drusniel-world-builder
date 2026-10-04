import { NoColorSpace, SRGBColorSpace } from 'three';
import { createSkinTexture } from './serpentMaterial.js';
import { serpentPatternSize } from './serpentSkin.js';
import { serpentScaleCoordinates, serpentStations } from './serpentShape.js';

/** Shared worker-generated skins, with a bounded cache across habitat changes. */
export class SerpentSkins {
  constructor() {
    this.tile = createSkinTexture({ width: 512, height: 512, fill: [128, 128, 255, 128],
      colorSpace: NoColorSpace, name: 'Serpent scales' });
    this.coats = new Map(); this.queue = []; this.worker = null; this.disposed = false;
  }
  acquire(settings) {
    const key = JSON.stringify([settings.species, settings.shape]);
    let coat = this.coats.get(key);
    if (!coat) {
      if (this.coats.size >= 6) {
        const unused = [...this.coats.entries()].find(([, item]) => item.refs === 0 && !item.pending);
        if (!unused) return null;
        unused[1].texture.dispose(); this.coats.delete(unused[0]);
      }
      const coordinates = serpentScaleCoordinates(serpentStations(settings.shape), settings.shape);
      const texture = createSkinTexture({ ...serpentPatternSize(settings.shape, coordinates.at(-1)),
        fill: [96, 96, 64, 0], colorSpace: SRGBColorSpace, name: settings.label });
      coat = { texture, refs: 0, pending: true, settings }; this.coats.set(key, coat);
      this.queue.push(coat); this.pump();
    }
    coat.refs++;
    return { tile: this.tile, pattern: coat.texture, release: () => { coat.refs--; } };
  }
  pump() {
    if (this.worker || this.disposed || !this.queue.length) return;
    const coat = this.queue.shift();
    try {
      const worker = new Worker(new URL('./serpentSkin.worker.js', import.meta.url), { type: 'module' });
      this.worker = worker;
      const finish = () => { worker.terminate(); this.worker = null; coat.pending = false; this.pump(); };
      worker.onmessage = ({ data }) => {
        if (!this.disposed) {
          this.tile.image.data.set(data.tile.data); this.tile.needsUpdate = true;
          coat.texture.image.data.set(data.coats[0].data); coat.texture.needsUpdate = true;
        }
        finish();
      };
      worker.onerror = error => { console.warn('Serpent skin worker unavailable.', error.message); finish(); };
      worker.postMessage({ tile: { size: 512 }, coats: [{ species: coat.settings.species,
        shape: coat.settings.shape, seed: 5113 }] });
    } catch (error) { coat.pending = false; console.warn('Serpent skin worker unavailable.', error); this.pump(); }
  }
  dispose() {
    this.disposed = true; this.worker?.terminate(); this.worker = null; this.queue.length = 0;
    this.tile.dispose(); for (const coat of this.coats.values()) coat.texture.dispose(); this.coats.clear();
  }
}
