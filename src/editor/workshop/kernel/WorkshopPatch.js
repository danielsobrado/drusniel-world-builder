import { normalizeWorkshopDocument } from './WorkshopDocument.js';
import { normalizeWorkshopEntity } from './WorkshopEntity.js';

function normalizeOperation(input, index) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error(`Workshop patch operation ${index + 1} must be an object.`);
  }
  if (input.op === 'put') {
    const entity = normalizeWorkshopEntity(input.entity);
    return Object.freeze({ op: 'put', entity });
  }
  if (input.op === 'remove') {
    if (typeof input.id !== 'string' || input.id.length === 0) {
      throw new Error(`Workshop remove operation ${index + 1} requires an id.`);
    }
    return Object.freeze({ op: 'remove', id: input.id });
  }
  throw new Error(`Unknown workshop patch operation: ${input.op}.`);
}

function targetId(operation) {
  return operation.op === 'put' ? operation.entity.id : operation.id;
}

export class WorkshopPatch {
  constructor(input = {}) {
    const source = Array.isArray(input) ? { operations: input } : input;
    if (!source || typeof source !== 'object') throw new Error('Workshop patch must be an object.');
    const operations = source.operations ?? [];
    if (!Array.isArray(operations)) throw new Error('Workshop patch operations must be an array.');
    const normalized = operations.map(normalizeOperation);
    const targets = normalized.map(targetId);
    if (new Set(targets).size !== targets.length) {
      throw new Error('Workshop patch cannot target the same entity more than once.');
    }
    this.label = typeof source.label === 'string' ? source.label.trim().slice(0, 96) : '';
    this.operations = Object.freeze(normalized);
    Object.freeze(this);
  }

  get isEmpty() {
    return this.operations.length === 0;
  }
}

export function normalizeWorkshopPatch(input) {
  return input instanceof WorkshopPatch ? input : new WorkshopPatch(input);
}

export function applyWorkshopPatch(documentInput, patchInput) {
  const document = normalizeWorkshopDocument(documentInput);
  const patch = normalizeWorkshopPatch(patchInput);
  if (patch.isEmpty) {
    return Object.freeze({
      document,
      inverse: new WorkshopPatch({ label: patch.label, operations: [] }),
      touchedIds: Object.freeze([]),
    });
  }

  const updates = new Map();
  const inverse = [];
  for (const operation of patch.operations) {
    const id = targetId(operation);
    const previous = document.getEntity(id);
    inverse.unshift(previous
      ? { op: 'put', entity: previous }
      : { op: 'remove', id });
    updates.set(id, operation.op === 'put' ? operation.entity : null);
  }

  const next = document.withEntities(updates);
  return Object.freeze({
    document: next,
    inverse: new WorkshopPatch({ label: patch.label, operations: inverse }),
    touchedIds: Object.freeze(patch.operations.map(targetId).sort()),
  });
}

export function diffWorkshopDocuments(baseInput, targetInput, label = '') {
  const base = normalizeWorkshopDocument(baseInput);
  const target = normalizeWorkshopDocument(targetInput);
  const before = new Map(base.listEntities().map((entity) => [entity.id, entity]));
  const after = new Map(target.listEntities().map((entity) => [entity.id, entity]));
  const operations = [];

  for (const id of [...before.keys()].filter((id) => !after.has(id)).sort()) {
    operations.push({ op: 'remove', id });
  }
  for (const id of [...after.keys()].sort()) {
    const left = before.get(id);
    const right = after.get(id);
    if (!left || JSON.stringify(left) !== JSON.stringify(right)) {
      operations.push({ op: 'put', entity: right });
    }
  }
  return new WorkshopPatch({ label, operations });
}
