// Original Gods' End SeaAlgae.js recipes.
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { colored, ribbon } from './geometryPrimitives.js';

export function seagrass(blades, segments, random) {
  const parts = [];
  for (let i = 0; i < blades; i += 1) {
    const blade = ribbon(0.03, segments, (random() - 0.5) * 0.6, (random() - 0.5) * 0.8);
    blade.scale(1, 0.7 + random() * 0.3, 1);
    blade.rotateY((i / blades) * Math.PI * 2 + random() * 0.5);
    blade.translate((random() - 0.5) * 0.15, 0, (random() - 0.5) * 0.15);
    parts.push(colored(blade, { base: '#2d5a1f', top: '#86ad3c' }));
  }
  return mergeGeometries(parts);
}

export function kelp(fronds, segments, random) {
  const parts = [];
  for (let i = 0; i < fronds; i += 1) {
    const frond = ribbon(0.085, segments, (random() - 0.5) * 0.9, (random() - 0.5) * 2.2);
    frond.scale(1, 0.8 + random() * 0.2, 1);
    frond.rotateY((i / fronds) * Math.PI * 2 + random() * 0.8);
    parts.push(colored(frond, { base: '#3f3a18', top: '#8f7c30' }));
  }
  return mergeGeometries(parts);
}

export function tuft(branches, segments, random) {
  const parts = [];
  for (let i = 0; i < branches; i += 1) {
    const branch = ribbon(0.045, segments, 0.12 + random() * 0.25, (random() - 0.5) * 1.5);
    branch.scale(1, 0.7 + random() * 0.3, 1);
    branch.rotateZ((random() - 0.5) * 0.5);
    branch.rotateY((i / branches) * Math.PI * 2 + random() * 0.6);
    parts.push(colored(branch, { base: '#5a241d', top: '#b0583a' }));
  }
  return mergeGeometries(parts);
}
