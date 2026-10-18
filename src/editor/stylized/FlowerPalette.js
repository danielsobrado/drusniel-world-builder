import { Color, DataTexture, FloatType, NearestFilter, RGBAFormat } from 'three/webgpu';
import { ivec2, texture } from 'three/tsl';

const FIELDS = ['colorR', 'colorG', 'colorB'];

export function resolveFlowerPalette(config, tileId) {
  const flowers = config.flowers ?? {};
  const entry = { ...flowers, ...flowers.byTileId?.[tileId] };
  return FIELDS.map(field => {
    if (!/^#[0-9a-f]{6}$/i.test(entry[field] ?? '')) throw new Error(`Invalid flower palette ${tileId}.${field}`);
    return new Color(entry[field]);
  });
}

/** Petal palette, indexed by canonical biome ID; integer loads need no sampler. */
export function createFlowerPalette(config, tileSample) {
  const pixels = new Float32Array(256 * 3 * 4);
  for (let id = 0; id < 256; id++) resolveFlowerPalette(config, id).forEach((color, row) => {
    pixels.set([...color.toArray(), 1], (row * 256 + id) * 4);
  });
  const map = new DataTexture(pixels, 256, 3, RGBAFormat, FloatType);
  map.name = 'flower-biome-palette'; map.minFilter = map.magFilter = NearestFilter;
  map.generateMipmaps = false; map.needsUpdate = true;
  const id = tileSample.a.mul(255).round().toInt();
  return { colors: FIELDS.map((_, row) => texture(map, ivec2(id, row)).setSampler(false).rgb),
    map, dispose: () => map.dispose() };
}
