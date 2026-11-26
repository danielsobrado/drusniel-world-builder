import { DoubleSide, MeshBasicMaterial } from 'three/webgpu';
import { uniform } from 'three/tsl';
import { ALL_WATER_FEATURES } from './WaterFeatureProfile.js';
import { createStylizedWaterMaterial } from './StylizedWaterMaterial.js';
import { bilinearLoad, perObjectTexture } from '../materials/TerrainSlotBindings.js';

export const WATER_SLOT_OPTIONS = 'waterSlotOptions';

/** One graph for each water variant, with exact per-slot inputs at draw time. */
export class SharedWaterMaterials {
  /** @param {?OceanFftBinding} oceanFft the view's shared FFT slope binding (PR I); null when off */
  constructor(reflections = null, oceanFft = null) {
    this.reflections = reflections;
    this.oceanFft = oceanFft;
    this.materials = new Map();
    this.placeholder = new MeshBasicMaterial();
    this.bindings = null;
    this.disposed = false;
  }

  get(options, enableRefraction, features = ALL_WATER_FEATURES) {
    const key = `${features}:${Number(enableRefraction)}`;
    if (this.materials.has(key)) return this.materials.get(key);
    if (!this.bindings) {
      const read = object => object?.userData?.[WATER_SLOT_OPTIONS] ?? options;
      const bindings = { ...options };
      for (const name of ['waterSurfaceOrigin', 'chunkCenter', 'time', 'rippleOrigin', 'patternOrigin', 'oceanFftOrigin']) {
        const value = options[name]?.value;
        if (value === undefined) continue;
        bindings[name] = uniform(value.clone?.() ?? value)
          .onObjectUpdate(({ object }) => read(object)[name].value);
      }
      bindings.seaPhaseOrigin = options.seaPhaseOrigin?.map((node, index) => uniform(node.value)
        .onObjectUpdate(({ object }) => read(object).seaPhaseOrigin[index].value));
      bindings.oceanSwellOrigin = options.oceanSwellOrigin?.map((node, index) => uniform(node.value.clone())
        .onObjectUpdate(({ object }) => read(object).oceanSwellOrigin[index].value));
      bindings.surfacePatterns = options.surfacePatterns.perObject(object => read(object).surfacePatterns);
      bindings.sampleTexture = (name, template, uv) => perObjectTexture(template, uv, object => read(object)[name]);
      bindings.loadTexture = (name, template, uv) => bilinearLoad(template, uv, object => read(object)[name]);
      this.bindings = bindings;
    }
    const material = createStylizedWaterMaterial({ ...this.bindings, enableRefraction, features, reflections: this.reflections, oceanFft: this.oceanFft });
    material.side = DoubleSide;
    this.materials.set(key, material);
    material.userData.waterFeatureProfile = features;
    return material;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const material of this.materials.values()) material.dispose();
    this.materials.clear();
    this.placeholder.dispose();
  }
}
