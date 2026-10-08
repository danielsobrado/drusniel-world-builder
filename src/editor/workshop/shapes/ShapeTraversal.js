import { shapeChoice, shapeCommon, shapeNumber, shapeSuppression } from './ShapeValidation.js';
import { arcWallPath, sampleShapePath, placeShapePoint, shapeBounds } from './ShapePaths.js';
import { shapeTraversalHeight, createShapeTraversalSurface } from './ShapeTraversalSurface.js';
import { normalizeShapeStyle } from './ShapeStyles.js';

export function normalizeShapeTraversal(source) {
  const common = shapeCommon(source);
  const rise = shapeNumber(source.rise, 'Traversal rise', 1.5, -8, 8);
  if (common.elevation + rise < 0)
    throw new Error('Traversal endpoints must stay above the ground.');
  if (source.railing !== undefined && typeof source.railing !== 'boolean')
    throw new Error('Railings must be a boolean.');
  return Object.freeze({
    ...common,
    style: normalizeShapeStyle(source.style),
    kind: 'traversal',
    length: shapeNumber(source.length, 'Traversal length', 6, 1, 32),
    width: shapeNumber(source.width, 'Traversal width', 1.6, 0.6, 8),
    bend: shapeNumber(source.bend, 'Traversal bend', 0, -16, 16),
    rise,
    mode: shapeChoice(source.mode, 'traversal mode', 'auto', [
      'auto',
      'stairs',
      'ramp',
      'walkway',
      'bridge',
    ]),
    railing: source.railing !== false,
    support: shapeChoice(source.support, 'support policy', 'piers', ['piers', 'arch', 'none']),
    suppressed: shapeSuppression(source),
  });
}

export function planShapeTraversal(primitive) {
  const curve = sampleShapePath(arcWallPath(primitive.id, primitive.length, primitive.bend));
  const slope = Math.abs(primitive.rise) / curve.length;
  const mode =
    primitive.mode === 'auto'
      ? slope < 0.035
        ? 'walkway'
        : slope < 0.12
          ? 'ramp'
          : 'stairs'
      : primitive.mode;
  const steps = mode === 'stairs' ? Math.max(2, Math.ceil(Math.abs(primitive.rise) / 0.18)) : 0;
  const boundary = curve.samples.map((sample) => placeShapePoint(primitive, sample.point));
  const deckHeight = (t) => shapeTraversalHeight(primitive, mode, steps, t);
  const route = curve.samples.map((sample, index) => ({
    position: [boundary[index][0], deckHeight(sample.distance / curve.length), boundary[index][1]],
    distance: sample.distance,
  }));
  const footprint = { kind: 'path', points: boundary, width: primitive.width };
  const supports = [];
  const surface = createShapeTraversalSurface({ primitive, curve, mode, steps });
  if (primitive.support !== 'none') {
    for (const t of primitive.support === 'arch' && mode === 'bridge'
      ? [0.08, 0.92]
      : [0.08, 0.5, 0.92]) {
      const position = surface(t);
      const key = `support:${primitive.id}:pier-${Math.round(t * 100)}`;
      if (position[1] > 0.25 && !primitive.suppressed.includes(key)) {
        supports.push({
          id: key,
          derivationKey: key,
          sourceEntityIds: [primitive.id],
          ruleId: 'traversal-support',
          generatorVersion: 1,
          source: 'auto',
          position,
          height: position[1],
          family: primitive.support,
        });
      }
    }
  }
  return {
    id: primitive.id,
    primitive,
    curve,
    boundary,
    route,
    mode,
    steps,
    supports,
    bounds: shapeBounds(boundary, primitive.width / 2 + 0.12),
    regions: ['deck', 'trim'].map((family) => ({
      id: `${primitive.id}:${family}`,
      primitiveId: primitive.id,
      componentId: primitive.id,
      label: `${primitive.label} · ${family}`,
      family: 'stone',
      connected: true,
    })),
    rpg: {
      collisionSlabs: [
        {
          id: `${primitive.id}:deck`,
          primitiveId: primitive.id,
          footprint,
          route,
          thickness: 0.24,
          mode,
          steps,
          gaps: [],
        },
      ],
      walkableFloors: [
        {
          id: `${primitive.id}:walk`,
          primitiveId: primitive.id,
          footprint,
          route,
          mode,
          steps,
        },
      ],
      roomBoundaries: [],
      portals: [],
      foundationContacts: supports.map((support) => ({
        id: `${support.id}:contact`,
        primitiveId: primitive.id,
        position: [support.position[0], 0, support.position[2]],
      })),
      stairSockets: [route[0], route.at(-1)].map((node, index) => ({
        id: `${primitive.id}:landing-${index}`,
        primitiveId: primitive.id,
        position: node.position,
        width: primitive.width,
      })),
      coverSurfaces: [],
    },
  };
}
