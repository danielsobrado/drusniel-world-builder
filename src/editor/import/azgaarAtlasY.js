/**
 * Azgaar's y runs south, but cell z runs north (world -Z, with x east), which is
 * what makes the walked world the map rather than its mirror image. Every source
 * y crosses into atlas rows here, so atlas rows grow with cell z like the rest of
 * the engine and nothing past the import has to know.
 */
export function azgaarYToAtlas(sourceY, sourceHeight, atlasHeight) {
  return (1 - sourceY / sourceHeight) * atlasHeight;
}
