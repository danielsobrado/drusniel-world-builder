/**
 * The coat coverage a material lays, recorded against the material itself.
 *
 * Each surface decides where its coats lie from its own masks (see
 * docs/surface-coatings); this is only where it records the result, so a reader
 * that is not the surface's own shader (the WSC diagnostics D22 moss and D23
 * snow, the rock view's snow-aware proxies) sees exactly the coverage drawn,
 * instead of guessing it again from normals and altitude.
 *
 * Coverage nodes are 0..1 TSL nodes in the material's own graph. They are kept
 * in a WeakMap, not `userData`: `Material.clone()` deep-copies `userData` through
 * JSON, which turned every node into an empty object, and a diagnostic built
 * from one failed WGSL with `[object Object]`. A clone does not inherit coverage
 * by itself; the code that clones a coated material passes it on with
 * `inheritCoatCoverage`.
 */
export const COAT_LAYERS = Object.freeze(['moss', 'snow', 'wet']);
const EMPTY = Object.freeze({});
const coverageByMaterial = new WeakMap();

/** Records `{ moss, snow, wet }` coverage nodes on `material`; layers left out keep what was published before. */
export function publishCoatCoverage(material, layers) {
  const next = { ...(coverageByMaterial.get(material) ?? EMPTY) };
  for (const layer of COAT_LAYERS) {
    const node = layers[layer];
    if (node === undefined || node === null) continue;
    if (!node.isNode) throw new TypeError(`Coat coverage "${layer}" must be a TSL node.`);
    next[layer] = node;
  }
  coverageByMaterial.set(material, Object.freeze(next));
  return material;
}

/** The coverage a material published, or an empty record. */
export function coatCoverageOf(material) {
  return (material && coverageByMaterial.get(material)) ?? EMPTY;
}

/** Gives `clone` the coverage `source` published, for materials cloned after their coats were laid. */
export function inheritCoatCoverage(source, clone) {
  const coverage = source && coverageByMaterial.get(source);
  if (coverage && clone) coverageByMaterial.set(clone, coverage);
  return clone;
}
