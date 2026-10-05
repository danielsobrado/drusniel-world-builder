import { Vector3 } from 'three';
import { createGodsEndAquaticGeometry } from './aquaticGeometry.js';
import { GODS_END_AQUATIC_SPECIES } from './aquaticSpecies.js';

export function createAquaticCatalogEntries() {
  return Object.entries(GODS_END_AQUATIC_SPECIES).map(([species, spec]) => {
    const geometry = createGodsEndAquaticGeometry(species);
    const floating = spec.placement === 'surface';
    geometry.scale(floating ? spec.height : 1, spec.height, floating ? spec.height : 1);
    geometry.computeBoundingBox();
    const dimensions = geometry.boundingBox.getSize(new Vector3()).toArray().map(value => Math.max(0.01, value));
    geometry.dispose();
    const name = species.replace(/([A-Z])/g, ' $1').replace(/^./, value => value.toUpperCase());
    return {
      key: `gods-end-aquatic-${species.toLowerCase()}`, label: `Gods’ End ${name}`,
      category: 'nature', icon: floating ? '🪷' : '🌿', color: spec.color,
      asset: { kind: 'aquatic', species, dimensions, height: spec.height },
      water: { placement: spec.placement ?? 'rooted', minimumCoverage: 0.55,
        minimumDepth: floating ? spec.depth[0] : Math.max(spec.depth[0], dimensions[1] + 0.12),
        maximumDepth: spec.depth[1], allowedKinds: spec.kinds,
        ...(floating ? { maximumShoreDistance: spec.shoreDistance[1] } : {}),
        heightOffset: floating ? 0.06 : -0.02 },
      collision: 'none',
    };
  });
}
