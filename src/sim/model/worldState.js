import { ENTITY_KINDS } from './entityKinds.js';
import { createEntityEnvelope } from './entityEnvelope.js';

const entityListCache = new WeakMap();
const cloneBaseState = new WeakMap();

const COLLECTION_BY_KIND = Object.freeze({
  region: 'regions',
  settlement: 'settlements',
  populationCohort: 'populations',
  market: 'markets',
  resourceSite: 'resourceSites',
  route: 'routes',
  faction: 'factions',
  shipment: 'shipments',
  party: 'parties',
  encounterSite: 'encounters',
  conflict: 'conflicts',
  contract: 'contracts',
  worldEvent: 'worldEvents',
  inventoryAccount: 'inventories',
  facility: 'facilities',
  tradeOffer: 'tradeOffers',
  carrier: 'carriers',
  character: 'characters',
  opportunity: 'opportunities',
  militaryCompany: 'militaryCompanies',
  graphNode: 'graphNodes',
  graphEdge: 'graphEdges',
});

export function collectionNameForKind(kind) {
  const name = COLLECTION_BY_KIND[kind];
  if (!name) throw Object.assign(new Error(`unknown_kind:${kind}`), { code: 'invalid_entity_kind' });
  return name;
}

export function createEmptyWorldState({
  calendar = { tick: 0, year: 1, month: 1, day: 1, hour: 8, minute: 0 },
  revision = 0,
} = {}) {
  const collections = {};
  for (const kind of ENTITY_KINDS) {
    collections[collectionNameForKind(kind)] = new Map();
  }
  return {
    calendar: { ...calendar },
    revision,
    diagnostics: {
      commandsAccepted: 0,
      commandsRejected: 0,
      eventsEmitted: 0,
      eventsApplied: 0,
      validationFailures: {},
    },
    ...collections,
  };
}

export function cloneWorldState(state, { mutableKinds = ENTITY_KINDS } = {}) {
  const mutable = new Set(mutableKinds);
  const next = createEmptyWorldState({
    calendar: { ...state.calendar },
    revision: state.revision,
  });
  next.diagnostics = structuredClone(state.diagnostics);
  for (const kind of ENTITY_KINDS) {
    const key = collectionNameForKind(kind);
    if (!mutable.has(kind)) {
      next[key] = state[key];
      continue;
    }
    for (const [id, entity] of state[key]) next[key].set(id, structuredClone(entity));
  }
  cloneBaseState.set(next, state);
  return next;
}

function invalidateEntityList(state, kind) {
  entityListCache.get(state)?.delete(kind);
}

function writableCollection(state, kind) {
  const key = collectionNameForKind(kind);
  const base = cloneBaseState.get(state);
  if (base && state[key] === base[key]) state[key] = new Map(base[key]);
  return state[key];
}

export function putEntity(state, entity) {
  const collection = writableCollection(state, entity.kind);
  if (collection.has(entity.id)) {
    throw Object.assign(new Error(`duplicate_entity_id:${entity.id}`), { code: 'duplicate_entity_id' });
  }
  collection.set(entity.id, entity);
  invalidateEntityList(state, entity.kind);
  return entity;
}

export function upsertEntity(state, entity) {
  writableCollection(state, entity.kind).set(entity.id, entity);
  invalidateEntityList(state, entity.kind);
  return entity;
}

export function getEntity(state, kind, id) {
  return state[collectionNameForKind(kind)].get(id) ?? null;
}

export function requireEntity(state, kind, id) {
  const entity = getEntity(state, kind, id);
  if (!entity) {
    throw Object.assign(new Error(`missing_reference:${kind}:${id}`), { code: 'missing_reference' });
  }
  return entity;
}

export function listEntities(state, kind, { includeDestroyed = true } = {}) {
  let cache = entityListCache.get(state);
  if (!cache) {
    cache = new Map();
    entityListCache.set(state, cache);
  }
  let entities = cache.get(kind);
  if (!entities) {
    entities = [...state[collectionNameForKind(kind)].values()]
      .sort((a, b) => a.id.localeCompare(b.id));
    cache.set(kind, entities);
  }
  return includeDestroyed
    ? entities.slice()
    : entities.filter((entity) => entity.status === 'active');
}

export function createAndPutEntity(state, fields) {
  const entity = createEntityEnvelope(fields);
  return putEntity(state, entity);
}

export { COLLECTION_BY_KIND };
