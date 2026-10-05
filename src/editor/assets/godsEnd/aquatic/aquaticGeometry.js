import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { eelgrass, flower, lilyPad, pondweed, waterweed } from './lakeGeometry.js';
import { kelp, seagrass, tuft } from './seaGeometry.js';

export function aquaticRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function createGodsEndAquaticGeometry(kind, { lod = 'near', seed = 77103 } = {}) {
  const near = lod === 'near';
  const random = aquaticRandom(seed);
  switch (kind) {
    case 'seagrass': return seagrass(near ? 8 : 4, near ? 5 : 2, random);
    case 'kelp': return kelp(near ? 5 : 3, near ? 7 : 3, random);
    case 'redAlgae': return tuft(near ? 11 : 5, near ? 4 : 2, random);
    case 'eelgrass': return eelgrass(near ? 7 : 3, near ? 5 : 2, random);
    case 'waterweed': return waterweed(near ? 9 : 5, near ? 8 : 5);
    case 'pondweed': return pondweed(near ? 5 : 3, near ? 8 : 5, random);
    case 'lilyPad': return lilyPad(near ? 18 : 7);
    case 'floweringLilyPad': {
      const pad = lilyPad(near ? 18 : 7);
      const bloom = flower(near ? 8 : 4);
      const geometry = mergeGeometries([pad, bloom]);
      pad.dispose();
      bloom.dispose();
      return geometry;
    }
    default: throw new Error(`Unknown Gods' End aquatic species: ${kind}.`);
  }
}
