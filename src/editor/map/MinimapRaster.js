import { MINIMAP_SIZE } from '../constants.js';
import { hexToRgbBytes } from '../tileCatalog.js';
import { shadeMinimapPixel } from './minimapRelief.js';
import { SettlementSamplingPreparation } from '../world/settlements/SettlementSamplingPreparation.js';

export const WAIT_FOR_MINIMAP = 'wait-for-minimap';

/** Builds a complete bitmap off the published canvas, retaining only one window
 * of exact terrain samples between redraws. The caller atomically adopts it. */
export class MinimapRaster {
  constructor({ tileMap, heightField, objectMap, objectByKey, size = MINIMAP_SIZE }) {
    Object.assign(this, { tileMap, heightField, objectMap, objectByKey, size });
    this.heights = new Map(); this.tiles = new Map();
    const store = heightField.worldStore;
    this.sampling = store ? new SettlementSamplingPreparation(store) : null;
  }

  revision() {
    const store = this.heightField.worldStore;
    return `${store?.baseTerrainRevision}:${store?.revision}:${this.objectMap.revision}`;
  }

  *build(center, cells, context, shouldYield = () => false) {
    const { size, tileMap, heightField } = this;
    const minimumX = center.x - Math.floor(cells / 2), minimumZ = center.z - Math.floor(cells / 2);
    const cellAt = (pixel, minimum) => minimum + Math.floor(pixel * cells / size);
    const bounds = { minX: cellAt(-1, minimumX), maxX: cellAt(size, minimumX) + 1,
      minZ: cellAt(-1, minimumZ), maxZ: cellAt(size, minimumZ) + 1 };
    while (this.sampling && !this.sampling.prepare(bounds, shouldYield)) yield WAIT_FOR_MINIMAP;
    const store = heightField.worldStore;
    if (store?.generator !== this.generator || store?.revision !== this.terrainRevision) {
      this.heights.clear(); this.tiles.clear();
      this.generator = store?.generator; this.terrainRevision = store?.revision;
    }
    const nextHeights = new Map(), nextTiles = new Map(), colors = new Map();
    const image = context.createImageData(size, size), span = size + 2;
    const heights = new Float32Array(span * span);
    let units = 0;
    for (let row = 0; row < span; row++) for (let column = 0; column < span; column++) {
      const x = cellAt(column - 1, minimumX), z = cellAt(row - 1, minimumZ), key = `${x}:${z}`;
      let height = nextHeights.get(key) ?? this.heights.get(key);
      if (height === undefined) height = heightField.getCellHeight(x, z) ?? 0;
      nextHeights.set(key, height); heights[row * span + column] = height;
      if (++units % 256 === 0) yield;
    }
    const spacing = cells / size * (tileMap.tileSize ?? 1);
    const neighbours = { left: 0, right: 0, up: 0, down: 0 };
    for (let row = 0; row < size; row++) for (let column = 0; column < size; column++) {
      const x = cellAt(column, minimumX), z = cellAt(row, minimumZ), key = `${x}:${z}`;
      let id = nextTiles.get(key) ?? this.tiles.get(key);
      if (id === undefined) id = tileMap.get(x, z);
      nextTiles.set(key, id);
      const tile = tileMap.getTileDefinition(id);
      if (!colors.has(tile.color)) colors.set(tile.color, hexToRgbBytes(tile.color));
      const at = (row + 1) * span + column + 1;
      neighbours.left = heights[at - 1]; neighbours.right = heights[at + 1];
      neighbours.up = heights[at - span]; neighbours.down = heights[at + span];
      image.data.set([...shadeMinimapPixel(colors.get(tile.color), { water: tile.terrainClass === 'water',
        height: heights[at], neighbours, spacing }), 255], (row * size + column) * 4);
      if (++units % 256 === 0) yield;
    }
    const rectangle = { minX: minimumX, minZ: minimumZ, maxX: minimumX + cells - 1, maxZ: minimumZ + cells - 1 };
    const objects = this.objectMap.queryBounds(rectangle);
    this.heights = nextHeights; this.tiles = nextTiles;
    return { image, center: { ...center }, cells, objects, minimumX, minimumZ };
  }

  publish(result, context) {
    const { image, cells, objects, minimumX, minimumZ } = result;
    context.putImageData(image, 0, 0);
    const scale = this.size / cells;
    for (const object of objects) {
      if (object.x < minimumX || object.z < minimumZ || object.x >= minimumX + cells || object.z >= minimumZ + cells) continue;
      const definition = this.objectByKey.get(object.definitionKey);
      context.fillStyle = definition.color;
      context.fillRect(Math.floor((object.x - minimumX) * scale) - 1, Math.floor((object.z - minimumZ) * scale) - 1,
        Math.max(2, Math.ceil(definition.footprint.width * scale)), Math.max(2, Math.ceil(definition.footprint.depth * scale)));
    }
  }

  dispose() { this.sampling?.dispose(); this.heights.clear(); this.tiles.clear(); }
}
