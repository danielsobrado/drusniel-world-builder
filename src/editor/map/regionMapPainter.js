import { findVectorMapCell } from './worldMapVector.js';

const WATER_COLOR = '#1b2933';
const COAST_COLOR = '#3a5360';
const RIVER_COLOR = '#4e7c96';
const BORDER_COLOR = 'rgb(229 220 200 / 16%)';
const ROUTE_COLORS = Object.freeze({ roads: '#9e8867', trails: '#746755' });
const DEFAULT_ROUTE_COLOR = '#8a7658';
const SKIPPED_ROUTE_GROUPS = new Set(['searoutes']);
const LAND_HEIGHT = 20;
const RELIEF_GRID = 56;
const RELIEF_DESATURATE = 0.68;
const RELIEF_TINT = [78, 82, 74]; // muted cartographic slate-parchment

const pathSets = new WeakMap();

function parseHexRgb(hex) {
  const match = /^#?([0-9a-f]{6})$/i.exec(String(hex ?? ''));
  if (!match) return [96, 102, 92];
  const numeric = Number.parseInt(match[1], 16);
  return [(numeric >> 16) & 0xff, (numeric >> 8) & 0xff, numeric & 0xff];
}

/**
 * Desaturates vibrant Azgaar biome colors into a restrained dark-fantasy
 * cartographic palette so relief, roads, rivers, and landmarks read clearly.
 */
export function toCartographicTone(hexColor) {
  const [r, g, b] = parseHexRgb(hexColor);
  const lum = r * 0.299 + g * 0.587 + b * 0.114;
  const desaturatedR = r + (lum - r) * RELIEF_DESATURATE;
  const desaturatedG = g + (lum - g) * RELIEF_DESATURATE;
  const desaturatedB = b + (lum - b) * RELIEF_DESATURATE;
  // Blend toward dark-fantasy cartographic slate-parchment and settle luminance.
  const mix = 0.42;
  const outR = Math.round((desaturatedR * (1 - mix) + RELIEF_TINT[0] * mix) * 0.62);
  const outG = Math.round((desaturatedG * (1 - mix) + RELIEF_TINT[1] * mix) * 0.62);
  const outB = Math.round((desaturatedB * (1 - mix) + RELIEF_TINT[2] * mix) * 0.62);
  const clamp = (v) => Math.max(24, Math.min(180, v));
  return `rgb(${clamp(outR)} ${clamp(outG)} ${clamp(outB)})`;
}

/**
 * Computes a directional NW hillshade factor (0.58..1.22) and contour darkening
 * from a coarse elevation grid. Exported for unit testing.
 */
export function computeCartographicHillshade(heightsGrid, size, cellScale) {
  const shade = new Float32Array(size * size);
  for (let row = 0; row < size; row += 1) {
    const r0 = Math.max(0, row - 1);
    const r1 = Math.min(size - 1, row + 1);
    for (let col = 0; col < size; col += 1) {
      const c0 = Math.max(0, col - 1);
      const c1 = Math.min(size - 1, col + 1);
      const h = heightsGrid[row * size + col];
      if (h < LAND_HEIGHT) {
        shade[row * size + col] = 1;
        continue;
      }
      const dx = (heightsGrid[row * size + c0] - heightsGrid[row * size + c1]) * 1.4;
      const dz = (heightsGrid[r0 * size + col] - heightsGrid[r1 * size + col]) * 1.4;
      const vertical = Math.max(1.5, cellScale * 2.2);
      const len = Math.hypot(dx, vertical, dz) || 1;
      const light = Math.max(0, (-0.55 * dx + 0.62 * vertical - 0.55 * dz) / len);
      const contour = Math.abs(((h / 12) % 1) - 0.5) * 2 > 0.88 ? 0.88 : 1;
      shade[row * size + col] = (0.58 + light * 0.64) * contour;
    }
  }
  return shade;
}

function createReliefOverlay(model, rect) {
  const heights = model?.cartography?.heights;
  if (!heights || !model?.spatialIndex) return null;
  const grid = new Float32Array(RELIEF_GRID * RELIEF_GRID);
  for (let row = 0; row < RELIEF_GRID; row += 1) {
    const sy = rect.minY + ((row + 0.5) / RELIEF_GRID) * rect.height;
    for (let col = 0; col < RELIEF_GRID; col += 1) {
      const sx = rect.minX + ((col + 0.5) / RELIEF_GRID) * rect.width;
      const idx = findVectorMapCell(model, sx, sy);
      grid[row * RELIEF_GRID + col] = idx >= 0 ? heights[idx] : 0;
    }
  }
  const shade = computeCartographicHillshade(grid, RELIEF_GRID, rect.width / RELIEF_GRID);
  return { grid, shade };
}

function paintHillshadeLayer(context, model, rect, canvasWidth, canvasHeight) {
  if (typeof document === 'undefined') return;
  const relief = createReliefOverlay(model, rect);
  if (!relief) return;
  const offscreen = document.createElement('canvas');
  offscreen.width = RELIEF_GRID;
  offscreen.height = RELIEF_GRID;
  const offCtx = offscreen.getContext('2d');
  if (!offCtx) return;
  const img = offCtx.createImageData(RELIEF_GRID, RELIEF_GRID);
  for (let i = 0; i < RELIEF_GRID * RELIEF_GRID; i += 1) {
    const isLand = relief.grid[i] >= LAND_HEIGHT;
    const s = relief.shade[i];
    const offset = i * 4;
    if (!isLand) {
      img.data[offset] = 0;
      img.data[offset + 1] = 0;
      img.data[offset + 2] = 0;
      img.data[offset + 3] = 0;
    } else if (s >= 1) {
      // Sunlit ridge highlight
      img.data[offset] = 229;
      img.data[offset + 1] = 220;
      img.data[offset + 2] = 200;
      img.data[offset + 3] = Math.round(Math.min(0.24, (s - 1) * 0.9) * 255);
    } else {
      // NW shadow trough & contour darkening
      img.data[offset] = 10;
      img.data[offset + 1] = 14;
      img.data[offset + 2] = 18;
      img.data[offset + 3] = Math.round(Math.min(0.42, (1 - s) * 0.95) * 255);
    }
  }
  offCtx.putImageData(img, 0, 0);
  context.save();
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.imageSmoothingEnabled = true;
  context.drawImage(offscreen, 0, 0, canvasWidth, canvasHeight);
  context.restore();
}

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
  const provinceBorders = model.borders?.primaryByPreset?.provinces ?? '';
  paths = Object.freeze({
    fills: model.fillLayers.biomes.map((group) => ({
      color: toCartographicTone(group.color),
      path: new Path2D(group.d),
    })),
    coastline: new Path2D(model.borders.coastline),
    borders: provinceBorders ? new Path2D(provinceBorders) : null,
    rivers: model.rivers.map((river) => ({ width: river.width, path: new Path2D(river.d) })),
    routes: [...routes].map(([color, path]) => ({ color, path })),
  });
  pathSets.set(model, paths);
  return paths;
}

/**
 * Paints the Azgaar cartographic relief minimap inside a source-pixel rectangle:
 * desaturated terrain tones, cached directional hillshade + contours, subtle
 * borders, roads/trails, rivers, coastline, and optional map markers.
 *
 * @param {CanvasRenderingContext2D} context
 * @param {object} model from `createVectorMapModel`
 * @param {{ minX: number, minY: number, width: number, height: number }} rect source pixels
 * @param {Array<{ x: number, y: number, type?: string, icon?: string }>} [markers]
 */
export function paintRegionMap(context, model, rect, markers = []) {
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
    context.strokeStyle = color;
    context.lineWidth = pixel;
    context.stroke(path);
  }

  paintHillshadeLayer(context, model, rect, canvasWidth, canvasHeight);
  context.setTransform(scaleX, 0, 0, scaleY, -rect.minX * scaleX, -rect.minY * scaleY);

  if (paths.borders) {
    context.strokeStyle = BORDER_COLOR;
    context.lineWidth = 0.9 * pixel;
    context.setLineDash([2.5 * pixel, 2.5 * pixel]);
    context.stroke(paths.borders);
    context.setLineDash([]);
  }

  context.lineCap = 'round';
  context.lineJoin = 'round';
  for (const { color, path } of paths.routes) {
    context.strokeStyle = color;
    context.lineWidth = 1.45 * pixel;
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

  if (Array.isArray(markers) && markers.length > 0) {
    const r = 2.6 * pixel;
    for (const marker of markers) {
      const mx = Number(marker?.x);
      const my = Number(marker?.y);
      if (!Number.isFinite(mx) || !Number.isFinite(my)) continue;
      if (mx < rect.minX || mx > rect.minX + rect.width || my < rect.minY || my > rect.minY + rect.height) {
        continue;
      }
      context.fillStyle = '#b8a176';
      context.strokeStyle = '#151b20';
      context.lineWidth = 1.1 * pixel;
      context.beginPath();
      context.moveTo(mx, my - r);
      context.lineTo(mx + r, my);
      context.lineTo(mx, my + r);
      context.lineTo(mx - r, my);
      context.closePath();
      context.fill();
      context.stroke();
    }
  }

  context.setTransform(1, 0, 0, 1, 0, 0);
}
