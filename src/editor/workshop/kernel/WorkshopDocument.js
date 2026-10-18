import { WORKSHOP_DOCUMENT_VERSION } from './WorkshopKernelConstants.js';
import { normalizeWorkshopEntity } from './WorkshopEntity.js';
import { PersistentMap } from './PersistentMap.js';
import { WorkshopTopology } from './WorkshopTopology.js';
const DERIVED = Symbol('derived workshop document');

function requireRevision(value) {
  const revision = value ?? 0;
  if (!Number.isSafeInteger(revision) || revision < 0) {
    throw new Error('Workshop document revision must be a non-negative safe integer.');
  }
  return revision;
}

function entityInputs(input) {
  if (input === undefined) return [];
  if (Array.isArray(input)) return input;
  if (input && typeof input === 'object') return Object.values(input);
  throw new Error('Workshop document entities must be an array or object.');
}

function assertReferences(entities) {
  for (const entity of entities.values()) {
    if (entity.parentId && !entities.has(entity.parentId)) {
      throw new Error(`Workshop entity ${entity.id} has missing parent ${entity.parentId}.`);
    }
    for (const dependency of entity.dependsOn) {
      if (!entities.has(dependency)) {
        throw new Error(`Workshop entity ${entity.id} has missing dependency ${dependency}.`);
      }
    }
  }
}

function assertParentAcyclic(entities) {
  const visited = new Set();
  const visiting = new Set();

  const visit = (id) => {
    if (visited.has(id)) return;
    if (visiting.has(id)) throw new Error(`Workshop parent hierarchy contains a cycle at ${id}.`);
    visiting.add(id);
    const parentId = entities.get(id)?.parentId;
    if (parentId) visit(parentId);
    visiting.delete(id);
    visited.add(id);
  };

  for (const id of entities.keys()) visit(id);
}

export class WorkshopDocument {
  #entities;
  #ordered = null;

  constructor(input = {}) {
    if (input instanceof WorkshopDocument) return input;
    if (input?.[DERIVED]) {
      const { base, entities, topology } = input[DERIVED];
      this.version = base.version;
      this.revision = requireRevision(base.revision + 1);
      this.#entities = entities;
      this.topology = topology;
      Object.freeze(this);
      return;
    }
    if (input === null || typeof input !== 'object' || Array.isArray(input)) {
      throw new Error('Workshop document must be an object.');
    }
    const version = input.version ?? WORKSHOP_DOCUMENT_VERSION;
    if (version !== WORKSHOP_DOCUMENT_VERSION) {
      throw new Error(`Unsupported workshop document version: ${version}.`);
    }

    const entities = new Map();
    for (const source of entityInputs(input.entities)) {
      const entity = normalizeWorkshopEntity(source);
      if (entities.has(entity.id)) throw new Error(`Duplicate workshop entity id: ${entity.id}.`);
      entities.set(entity.id, entity);
    }
    assertReferences(entities);
    assertParentAcyclic(entities);

    this.version = version;
    this.revision = requireRevision(input.revision);
    this.#entities = PersistentMap.from(entities);
    this.topology = new WorkshopTopology(this.#entities);
    Object.freeze(this);
  }

  get size() {
    return this.#entities.size;
  }

  hasEntity(id) {
    return this.#entities.has(id);
  }

  getEntity(id) {
    return this.#entities.get(id) ?? null;
  }

  listEntities() {
    this.#ordered ??= Object.freeze([...this.#entities.values()].sort((left, right) => left.id.localeCompare(right.id)));
    return this.#ordered.slice();
  }

  withEntities(updates) {
    let entities = this.#entities;
    const normalized = new Map();
    for (const [id, value] of updates) {
      const entity = value === null ? null : normalizeWorkshopEntity(value);
      if (entity && entity.id !== id) throw new Error('Workshop update id does not match entity id.');
      normalized.set(id, entity);
      entities = entity ? entities.set(id, entity) : entities.delete(id);
    }
    const topology = this.topology.derive(entities, normalized);
    return new WorkshopDocument({ [DERIVED]: { base: this, entities, topology } });
  }

  rootIds() {
    return this.listEntities().filter(({ parentId }) => parentId === null).map(({ id }) => id);
  }

  toJSON() {
    return {
      version: this.version,
      revision: this.revision,
      entities: this.listEntities().map((entity) => entity.toJSON()),
    };
  }
}

export function normalizeWorkshopDocument(input) {
  return input instanceof WorkshopDocument ? input : new WorkshopDocument(input);
}
