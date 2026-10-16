const WATER_COLOR = '#9fc8d8';
const COAST_COLOR = '#3f5f68';
const RIVER_COLOR = '#5f9fc4';
const ROUTE_COLORS = Object.freeze({ roads: '#8a6a45', trails: '#9b8462' });
const DEFAULT_ROUTE_COLOR = '#8a6a45';
// Sea lanes cross open water, which the walking map has no use for.
const SKIPPED_ROUTE_GROUPS = new Set(['searoutes']);

const pathSets = new WeakMap();

/**
 * Path2D objects for one vector model, built on first paint. Each biome group,
 * the coastline, the rivers and each route group become a single path, so a
 * repaint is a handful of fills and strokes however many cells the world has.
 */
function pathsFor(model) {
  let paths = pathSets.get(model);
  if (paths) return paths;
  const routes = new Map();
  for (const route of model.routes) {
    if (SKIPPED_ROUTE_GROUPS.has(route.group)) continue;
    const color = ROUTE_COLORS[route.group] ?? DEFAULT_ROUTE_COLOR;
    if (!routes.has(color)) routes.set(color, new Path2D());
    routes.get(color).addPath(new Path2D(route.d));
  }
  paths = Object.freeze({
    fills: model.fillLayers.biomes.map((group) => ({ color: group.color, path: new Path2D(group.d) })),
    coastline: new Path2D(model.borders.coastline),
    rivers: model.rivers.map((river) => ({ width: river.width, path: new Path2D(river.d) })),
    routes: [...routes].map(([color, path]) => ({ color, path })),
  });
  pathSets.set(model, paths);
  return paths;
}

/**
 * Paints the Azgaar biome map inside a source-pixel rectangle onto a square
 * canvas: biome fills, coastline, rivers and roads, in the Azgaar source's own
 * orientation (y down), which is the same as the cell bitmap's z down.
 *
 * @param {CanvasRenderingContext2D} context
 * @param {object} model from `createVectorMapModel`
 * @param {{ minX: number, minY: number, width: number, height: number }} rect source pixels
 */
export function paintRegionMap(context, model, rect) {
  const { width: canvasWidth, height: canvasHeight } = context.canvas;
  const scaleX = canvasWidth / rect.width;
  const scaleY = canvasHeight / rect.height;
  const pixel = 1 / Math.min(scaleX, scaleY);
  const paths = pathsFor(model);

  context.setTransform(1, 0, 0, 1, 0, 0);
  context.fillStyle = WATER_COLOR;
  context.fillRect(0, 0, canvasWidth, canvasHeight);
  context.setTransform(scaleX, 0, 0, scaleY, -rect.minX * scaleX, -rect.minY * scaleY);

  for (const { color, path } of paths.fills) {
    context.fillStyle = color;
    context.fill(path);
    // A hairline in the fill's own colour closes the seams antialiasing
    // leaves between neighbouring polygons.
    context.strokeStyle = color;
    context.lineWidth = pixel;
    context.stroke(path);
  }

  context.lineCap = 'round';
  context.lineJoin = 'round';
  for (const { color, path } of paths.routes) {
    context.strokeStyle = color;
    context.lineWidth = 1.4 * pixel;
    context.setLineDash([3 * pixel, 2 * pixel]);
    context.stroke(path);
  }
  context.setLineDash([]);

  context.strokeStyle = RIVER_COLOR;
  for (const { width, path } of paths.rivers) {
    context.lineWidth = Math.max(1.2 * pixel, width * 0.35);
    context.stroke(path);
  }

  context.strokeStyle = COAST_COLOR;
  context.lineWidth = 1.5 * pixel;
  context.stroke(paths.coastline);
  context.setTransform(1, 0, 0, 1, 0, 0);
}
