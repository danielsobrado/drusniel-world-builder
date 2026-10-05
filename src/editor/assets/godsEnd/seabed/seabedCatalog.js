import { Vector3 } from 'three';
import { createSeabedRockGeometry } from './seabedGeometry.js';
import { WATER_KIND_OCEAN } from '../../../water/WaterConstants.js';

/** Metadata comes from the source recipe, independently of scene residency. */
export function createSeabedRockCatalogEntries() {
  return Array.from({ length: 3 }, (_, variant) => {
    const geometry = createSeabedRockGeometry(variant);
    geometry.computeBoundingBox();
    const dimensions = geometry.boundingBox.getSize(new Vector3()).toArray();
    geometry.dispose();
    return {
      key: `gods-end-seabed-boulder-${variant + 1}`, label: `Gods’ End Seabed Boulder ${variant + 1}`,
      category: 'nature', icon: '🪨', color: '#6f7560', collision: 'bounds',
      asset: { kind: 'seabedRock', variant, dimensions },
      water: { placement: 'rooted', minimumCoverage: 0.55, minimumDepth: 1.2,
        maximumDepth: 11, allowedKinds: [WATER_KIND_OCEAN], heightOffset: -0.08 },
    };
  });
}
