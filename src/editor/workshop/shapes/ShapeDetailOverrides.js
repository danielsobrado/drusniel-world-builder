import { shapeNumber, shapeRecord, shapePoint } from './ShapeValidation.js';

export function normalizeShapeDetailOverrides(value) {
  const records = value ?? [];
  if (!Array.isArray(records) || records.length > 128) throw new Error('A building supports at most 128 detail overrides.');
  const result = records.map((input) => {
    const o = shapeRecord(input, 'Detail override');
    if (typeof o.key !== 'string' || o.key.length > 160 || !o.key.startsWith('detail:')) throw new Error('Detail overrides require a stable derivation key.');
    return Object.freeze({ key: o.key,
      ...(o.at !== undefined ? { at: shapeNumber(o.at, 'Detail position', 0.5, 0, 1) } : {}),
      ...(o.bottom !== undefined ? { bottom: shapeNumber(o.bottom, 'Detail height', 0, 0, 24) } : {}),
      ...(o.position !== undefined ? { position: shapePoint(o.position) } : {}),
    });
  }).sort((a, b) => a.key.localeCompare(b.key));
  if (new Set(result.map((o) => o.key)).size !== result.length) throw new Error('Duplicate detail override key.');
  return Object.freeze(result);
}

export function shapeDetailPatch(primitive, key, fields) {
  const previous = primitive.detailOverrides.find((o) => o.key === key) ?? { key };
  return { detailOverrides: [...primitive.detailOverrides.filter((o) => o.key !== key), { ...previous, ...fields }] };
}
