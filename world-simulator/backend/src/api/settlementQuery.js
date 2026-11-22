import { ApiError } from './responses.js';

export const SORT_FIELDS = Object.freeze(['sourceId', 'name', 'population', 'npcs', 'stateName', 'cultureName', 'class']);
const ALLOWED = new Set(['page', 'pageSize', 'q', 'class', 'state', 'culture', 'minPopulation', 'maxPopulation', 'capital', 'pilot', 'sort', 'order']);

function integer(params, name, { min, max, fallback }) {
  if (!params.has(name)) return fallback;
  const value = Number(params.get(name));
  if (!Number.isInteger(value) || value < min || (max != null && value > max)) {
    throw new ApiError(400, 'invalid_parameter', `${name} must be an integer${max != null ? ` from ${min} to ${max}` : ` >= ${min}`}`, { parameter: name });
  }
  return value;
}

function boolean(params, name) {
  if (!params.has(name)) return null;
  const value = params.get(name);
  if (value !== 'true' && value !== 'false') throw new ApiError(400, 'invalid_parameter', `${name} must be true or false`, { parameter: name });
  return value === 'true';
}

const list = (params, name) => (params.has(name) ? params.get(name).split(',').map((v) => v.trim()).filter(Boolean) : null);

/** Parses and validates the settlement list query; unknown parameters are rejected. */
export function parseSettlementQuery(params, { defaultPageSize, maxPageSize }, classIds) {
  for (const key of params.keys()) {
    if (!ALLOWED.has(key)) throw new ApiError(400, 'invalid_parameter', `Unknown parameter ${key}`, { parameter: key, allowed: [...ALLOWED] });
  }
  const query = {
    page: integer(params, 'page', { min: 1, fallback: 1 }),
    pageSize: integer(params, 'pageSize', { min: 1, max: maxPageSize, fallback: defaultPageSize }),
    q: params.get('q')?.trim().toLowerCase() || null,
    classes: list(params, 'class'),
    states: list(params, 'state'),
    cultures: list(params, 'culture'),
    minPopulation: integer(params, 'minPopulation', { min: 0, fallback: null }),
    maxPopulation: integer(params, 'maxPopulation', { min: 0, fallback: null }),
    capital: boolean(params, 'capital'),
    pilot: boolean(params, 'pilot'),
    sort: params.get('sort') ?? 'sourceId',
    order: params.get('order') ?? 'asc',
  };
  if (!SORT_FIELDS.includes(query.sort)) throw new ApiError(400, 'invalid_parameter', `sort must be one of ${SORT_FIELDS.join(', ')}`, { parameter: 'sort' });
  if (query.order !== 'asc' && query.order !== 'desc') throw new ApiError(400, 'invalid_parameter', 'order must be asc or desc', { parameter: 'order' });
  const unknown = query.classes?.filter((c) => !classIds.includes(c));
  if (unknown?.length) throw new ApiError(400, 'invalid_parameter', `Unknown settlement class ${unknown.join(', ')}`, { parameter: 'class', allowed: classIds });
  if (query.minPopulation != null && query.maxPopulation != null && query.minPopulation > query.maxPopulation) {
    throw new ApiError(400, 'invalid_parameter', 'minPopulation must not exceed maxPopulation', { parameter: 'minPopulation' });
  }
  return query;
}

function matches(row, q) {
  return (!q.q || row.name.toLowerCase().includes(q.q))
    && (!q.classes || q.classes.includes(row.class))
    && (!q.states || q.states.includes(row.stateId ?? 'none'))
    && (!q.cultures || q.cultures.includes(row.cultureId ?? 'none'))
    && (q.minPopulation == null || row.population >= q.minPopulation)
    && (q.maxPopulation == null || row.population <= q.maxPopulation)
    && (q.capital == null || row.capital === q.capital)
    && (q.pilot == null || row.pilot === q.pilot);
}

export function querySettlements(rows, q) {
  const direction = q.order === 'desc' ? -1 : 1;
  const filtered = rows.filter((row) => matches(row, q)).sort((a, b) => {
    const x = a[q.sort];
    const y = b[q.sort];
    const primary = typeof x === 'string' ? String(x).localeCompare(String(y)) : (x ?? 0) - (y ?? 0);
    return primary * direction || a.sourceId - b.sourceId;
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / q.pageSize));
  const start = (q.page - 1) * q.pageSize;
  return {
    items: filtered.slice(start, start + q.pageSize),
    page: { page: q.page, pageSize: q.pageSize, totalItems: filtered.length, totalPages },
  };
}
