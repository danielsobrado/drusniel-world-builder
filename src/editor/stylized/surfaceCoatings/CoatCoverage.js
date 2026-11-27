/**
 * The coat coverage a material lays, published on the material itself.
 *
 * Each surface decides where its coats lie from its own masks (see
 * docs/surface-coatings); this is only where it records the result, so a reader
 * that is not the surface's own shader (the WSC diagnostics D22 moss and D23
 * snow, the rock view's snow-aware proxies) sees exactly the coverage drawn,
 * instead of guessing it again from normals and altitude.
 *
 * Coverage nodes are 0..1 TSL nodes in the material's own graph. A reader that
 * builds another material from them must not use material-specific nodes
 * (they are built from geometry, attributes, textures and uniforms only).
 */
const KEY = 'coatCoverage';
export const COAT_LAYERS = Object.freeze(['moss', 'snow', 'wet']);

/** Records `{ moss, snow, wet }` coverage nodes on `material`; layers left out keep what was published before. */
export function publishCoatCoverage(material, layers) {
  const current = material.userData[KEY] ?? {};
  const next = { ...current };
  for (const layer of COAT_LAYERS) {
    if (layers[layer] !== undefined && layers[layer] !== null) next[layer] = layers[layer];
  }
  material.userData[KEY] = Object.freeze(next);
  return material;
}

/** The coverage a material published, or an empty record. */
export function coatCoverageOf(material) {
  return material?.userData?.[KEY] ?? Object.freeze({});
}
