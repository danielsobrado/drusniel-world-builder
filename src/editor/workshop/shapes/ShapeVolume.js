import {
  shapeChoice,
  shapeCommon,
  shapeNumber,
  shapeSuppression,
  shapeRecord,
  shapeBoolean,
} from './ShapeValidation.js';
import {
  ovalFootprint,
  roundedFootprint,
  sampleShapePath,
  placeShapePoint,
  shapeBounds,
} from './ShapePaths.js';
import { CurvePath } from '../curves/CurvePath.js';
import { profileFootprintDimensions } from './ShapeProfileFootprint.js';
import { normalizeShapeOpenings, resolveShapeOpenings, shapeOpeningPortal } from './ShapeOpenings.js';
import { normalizeShapeStyle } from './ShapeStyles.js';
import { normalizeShapeFeatures } from './ShapeFeatureSchema.js';
import { normalizeShapeDetailOverrides } from './ShapeDetailOverrides.js';

export const SHAPE_ROOF_FAMILIES = Object.freeze(['hip', 'gable', 'bell', 'cone', 'spire', 'flat']);

export function normalizeShapeVolume(source) {
  const common = shapeCommon(source);
  const input = shapeRecord(source.footprint, 'Footprint');
  const family = shapeChoice(input.family, 'footprint', 'rounded', ['rounded', 'oval', 'custom']);
  const path = family === 'custom' ? new CurvePath(input.path).toJSON() : null;
  const dimensions = path ? profileFootprintDimensions(path) : input;
  const width = shapeNumber(dimensions.width, 'Footprint width', 7, 2, 32);
  const depth = shapeNumber(dimensions.depth, 'Footprint depth', 5, 2, 32);
  const cornerRadius = shapeNumber(
    input.cornerRadius,
    'Corner radius',
    0.8,
    0,
    Math.min(width, depth) / 2,
  );
  const height = shapeNumber(source.height, 'Wall height', 4, 1, 24);
  const levels = shapeNumber(source.levels, 'Levels', 1, 1, 8);
  if (!Number.isInteger(levels)) throw new Error('Levels must be an integer.');
  const roof = shapeRecord(source.roof, 'Roof');
  const normalizedOpenings = normalizeShapeOpenings(source.openings, height);
  return Object.freeze({
    ...common,
    style: normalizeShapeStyle(source.style),
    kind: 'curved-volume',
    footprint: Object.freeze({
      family,
      width,
      depth,
      cornerRadius,
      ...(path ? { path } : {}),
    }),
    height,
    levels,
    thickness: shapeNumber(
      source.thickness,
      'Wall thickness',
      0.28,
      0.12,
      Math.min(width, depth) / 5,
    ),
    taper: shapeNumber(source.taper, 'Wall taper', 1, 0.65, 1.2),
    roof: Object.freeze({
      family: shapeChoice(roof.family, 'roof family', 'gable', SHAPE_ROOF_FAMILIES),
      axis: shapeChoice(roof.axis, 'ridge direction', 'width', ['width', 'depth']),
      rise: shapeNumber(roof.rise, 'Roof rise', 2.6, 0.2, 12),
      overhang: shapeNumber(roof.overhang, 'Roof overhang', 0.4, 0.05, 1.5),
      sweep: shapeNumber(roof.sweep, 'Roof sweep', 0.45, 0, 1),
      sag: shapeNumber(roof.sag, 'Ridge sag', 0.12, 0, 0.5),
    }),
    surface: shapeChoice(source.surface, 'wall surface', 'plaster', [
      'plaster',
      'masonry',
      'planks',
    ]),
    openings: Object.freeze(normalizedOpenings),
    facade: shapeChoice(source.facade, 'facade treatment', 'plain', ['plain', 'timber']),
    shutters: shapeBoolean(source.shutters, 'Shutters'),
    craft: shapeBoolean(source.craft, 'Crafted details', true),
    features: normalizeShapeFeatures(source.features),
    detailOverrides: normalizeShapeDetailOverrides(source.detailOverrides),
    suppressed: shapeSuppression(source),
  });
}

export function resolveVolumePath(primitive) {
  const f = primitive.footprint;
  return f.family === 'custom'
    ? new CurvePath(f.path)
    : f.family === 'oval'
      ? ovalFootprint(primitive.id, f.width, f.depth)
      : roundedFootprint(primitive.id, f.width, f.depth, f.cornerRadius);
}

export function planShapeVolume(primitive) {
  const curve = sampleShapePath(resolveVolumePath(primitive));
  const openings = resolveShapeOpenings(primitive, curve);
  const boundary = curve.samples.map((sample) => placeShapePoint(primitive, sample.point));
  const topBoundary = curve.samples.map((sample) =>
    placeShapePoint(primitive, sample.point, primitive.taper),
  );
  const footprint = { kind: 'polygon', points: boundary };
  const floors = Array.from({ length: primitive.levels }, (_, index) => ({
    id: `${primitive.id}:level-${index + 1}`,
    primitiveId: primitive.id,
    elevation: primitive.elevation + (primitive.height * index) / primitive.levels,
    footprint: {
      kind: 'polygon',
      points: curve.samples.map((sample) =>
        placeShapePoint(
          primitive,
          sample.point,
          1 + ((primitive.taper - 1) * index) / primitive.levels,
        ),
      ),
    },
  }));
  return {
    id: primitive.id,
    primitive,
    curve,
    openings,
    boundary,
    topBoundary,
    bounds: shapeBounds([...boundary, ...topBoundary], primitive.thickness / 2 + primitive.roof.overhang),
    regions: ['walls', 'roof', 'trim', 'deck', 'inserts', 'glazing', 'foliage', 'metal'].map((family) => ({
      id: `${primitive.id}:${family}`,
      primitiveId: primitive.id,
      componentId: primitive.id,
      label: `${primitive.label} · ${family}`,
      family:
        family === 'trim' || family === 'deck'
          ? 'stone'
          : family === 'inserts'
            ? 'wood'
            : family === 'glazing'
              ? 'recess'
              : family,
      connected: true,
    })),
    rpg: {
      collisionSlabs: [
        {
          id: `${primitive.id}:shell`,
          primitiveId: primitive.id,
          elevation: primitive.elevation,
          height: primitive.height,
          thickness: primitive.thickness,
          footprint,
          topFootprint: { kind: 'polygon', points: topBoundary },
          gaps: openings,
        },
      ],
      walkableFloors: floors,
      roomBoundaries: floors.map((floor) => ({
        id: `${floor.id}:room`,
        primitiveId: primitive.id,
        levelId: floor.id,
        boundary: floor.footprint,
        adjacentRoomIds: [],
      })),
      portals: openings
        .filter((o) => o.role !== 'window')
        .map((o) => shapeOpeningPortal({ id: primitive.id, primitive }, o)),
      foundationContacts: [
        {
          id: `${primitive.id}:contact`,
          primitiveId: primitive.id,
          elevation: primitive.elevation,
          footprint,
        },
      ],
      coverSurfaces: [
        {
          id: `${primitive.id}:cover`,
          primitiveId: primitive.id,
          height: primitive.elevation + primitive.height,
          footprint,
        },
      ],
      stairSockets: [],
    },
  };
}
