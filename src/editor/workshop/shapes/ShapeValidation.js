export function shapeNumber(value, field, fallback, min, max) {
  const result = value === undefined ? fallback : value;
  if (!Number.isFinite(result) || result < min || result > max) {
    throw new Error(`${field} must be a finite number between ${min} and ${max}.`);
  }
  return result;
}

export function shapeChoice(value, field, fallback, choices) {
  const result = value === undefined ? fallback : value;
  if (!choices.includes(result)) throw new Error(`Unsupported ${field}: ${result}.`);
  return result;
}

export function shapeBoolean(value, field, fallback = false) {
  if (value !== undefined && typeof value !== 'boolean')
    throw new Error(`${field} must be a boolean.`);
  return value === undefined ? fallback : value;
}

export function shapeId(value, field = 'Shape id') {
  if (typeof value !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(value)) {
    throw new Error(`${field} must be a stable lowercase identifier.`);
  }
  return value;
}

export function shapeRecord(value, field, fallback = {}) {
  const result = value === undefined ? fallback : value;
  if (!result || typeof result !== 'object' || Array.isArray(result))
    throw new Error(`${field} must be an object.`);
  return result;
}

export function shapePoint(value, fallback = [0, 0]) {
  const point = value === undefined ? fallback : value;
  if (!Array.isArray(point) || point.length !== 2)
    throw new Error('Shape position requires two coordinates.');
  return Object.freeze(point.map((v) => shapeNumber(v, 'Shape coordinate', 0, -256, 256)));
}

export function shapeCommon(source) {
  if (!source || typeof source !== 'object' || Array.isArray(source))
    throw new Error('Shape must be an object.');
  return {
    id: shapeId(source.id),
    kind: source.kind,
    label: String(source.label ?? source.id).slice(0, 48),
    position: shapePoint(source.position),
    rotation: shapeNumber(source.rotation, 'Rotation', 0, -360, 360),
    elevation: shapeNumber(source.elevation, 'Elevation', 0, 0, 32),
  };
}

export function shapeSuppression(source) {
  const keys = source.suppressed ?? [];
  if (
    !Array.isArray(keys) ||
    keys.length > 1024 ||
    keys.some((key) => typeof key !== 'string' || key.length > 160)
  ) {
    throw new Error('Shape suppression keys must be an array of bounded strings.');
  }
  return Object.freeze([...new Set(keys)].sort());
}
