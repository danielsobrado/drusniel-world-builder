import { shapeNumber, shapeRecord } from './ShapeValidation.js';
import { shapeRandom } from './ShapeMesh.js';
import { SHAPE_COURSE_HEIGHT } from './ShapeProfile.js';

const COLUMN_WIDTH = 0.58;

/** Authored masonry collapse/breach intent, shared by towers and curtain walls. */
export function normalizeShapeRuin(value) {
  const input = shapeRecord(value, 'Wall ruin');
  return Object.freeze({
    amount: shapeNumber(input.amount, 'Wall ruin', 0, 0, 1),
    at: shapeNumber(input.at, 'Breach position', 0.25, 0, 1),
    width: shapeNumber(input.width, 'Breach width', 0.44, 0.12, 0.9),
  });
}

export const SHAPE_RUIN_NONE = normalizeShapeRuin({});

export function hasShapeRuin(primitive) {
  return (primitive?.ruin?.amount ?? 0) > 1e-4;
}

/**
 * Deterministic stepped masonry collapse profile along the perimeter.
 * Columns are snapped to whole courses so broken walls step cleanly like hand-laid ashlar.
 */
export function resolveShapeRuinColumns(primitive, length, closed = true) {
  if (!hasShapeRuin(primitive) || length <= 0) return [];
  const { amount, at, width } = primitive.ruin;
  const count = Math.max(closed ? 8 : 4, Math.round(length / COLUMN_WIDTH));
  const step = length / count;
  const minHeight = Math.min(primitive.height, Math.max(SHAPE_COURSE_HEIGHT * 3, primitive.height * 0.2));
  const maxDrop = Math.max(0, primitive.height - minHeight);
  const center = at * length;
  const halfSpan = Math.max(step, (width * length) / 2);
  const columns = [];
  for (let i = 0; i < count; i++) {
    const u0 = i * step;
    const u1 = (i + 1) * step;
    const mid = (u0 + u1) / 2;
    let delta = mid - center;
    if (closed) delta = ((((delta + length / 2) % length) + length) % length) - length / 2;
    const norm = Math.abs(delta) / halfSpan;
    if (norm >= 1) {
      columns.push({ index: i, u0, u1, height: primitive.height, breached: false });
      continue;
    }
    const envelope = Math.cos((norm * Math.PI) / 2) ** 1.35;
    const jitter = 0.72 + shapeRandom(0, primitive.id, 'wall-ruin-drop', i) * 0.56;
    const rawDrop = maxDrop * amount * envelope * jitter;
    const courses = Math.floor(rawDrop / SHAPE_COURSE_HEIGHT);
    const height = courses > 0
      ? Math.max(minHeight, primitive.height - courses * SHAPE_COURSE_HEIGHT)
      : primitive.height;
    columns.push({ index: i, u0, u1, height, breached: height < primitive.height - 1e-4 });
  }
  return columns;
}

/** Stepped ruin ceiling at arc-length `u` along the wall. */
export function shapeRuinCeiling(primitive, length, closed, columns) {
  if (!columns?.length) return () => primitive.height;
  const count = columns.length;
  return (u) => {
    const wrapped = closed ? ((u % length) + length) % length : Math.max(0, Math.min(length - 1e-6, u));
    const index = Math.min(count - 1, Math.max(0, Math.floor((wrapped / length) * count)));
    return columns[index].height;
  };
}

/** Breached arc-length spans where crown, roof deck or parapet should open. */
export function shapeRuinBreachSpans(columns) {
  const spans = [];
  for (const col of columns) {
    if (!col.breached) continue;
    const prev = spans.at(-1);
    if (prev && Math.abs(prev[1] - col.u0) < 1e-6) prev[1] = col.u1;
    else spans.push([col.u0, col.u1]);
  }
  return spans;
}

/** Collision void gaps for breached wall columns. */
export function shapeRuinCollisionGaps(primitive, length, columns) {
  if (!columns?.length) return [];
  const gaps = [];
  for (const col of columns) {
    if (!col.breached) continue;
    gaps.push({
      id: `${primitive.id}:ruin:${col.index}`,
      role: 'breach',
      profile: 'square',
      at: ((col.u0 + col.u1) / 2) / length,
      width: col.u1 - col.u0,
      bottom: col.height,
      height: primitive.height - col.height,
    });
  }
  return gaps;
}
