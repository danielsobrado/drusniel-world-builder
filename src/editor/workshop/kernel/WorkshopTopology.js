import { PersistentMap } from './PersistentMap.js';
const EMPTY = Object.freeze([]);
const sources = entity => [...new Set([entity.parentId, ...entity.dependsOn].filter(Boolean))];
function edges(entity) {
  return Object.freeze([
    ...(entity.parentId ? [{ type: 'PARENT', from: entity.parentId, to: entity.id }] : []),
    ...entity.dependsOn.map(from => ({ type: 'DEPENDENCY', from, to: entity.id })),
  ].map(Object.freeze));
}
const same = (a, b) => a?.parentId === b?.parentId && a?.dependsOn.length === b?.dependsOn.length
  && (a?.dependsOn ?? []).every((id, i) => id === b.dependsOn[i]);

/** Immutable local adjacency, shared by property-only revisions. */
export class WorkshopTopology {
  #order = null;
  #ranks = null;
  #validated = false;
  #base;
  constructor(entities, outgoing = null, changed = null, base = null) {
    this.entities = entities;
    this.changed = changed ? Object.freeze(changed) : null;
    this.#base = base;
    if (outgoing) this.rows = outgoing;
    else {
      const rows = new Map();
      for (const entity of entities.values()) for (const edge of edges(entity)) {
        if (!rows.has(edge.from)) rows.set(edge.from, []);
        rows.get(edge.from).push(edge);
      }
      this.rows = PersistentMap.from([...rows].map(([id, values]) => [id, Object.freeze(values)]));
    }
    Object.freeze(this);
  }
  derive(entities, updates) {
    const changed = [...updates].filter(([id, next]) => !same(this.entities.get(id), next));
    if (!changed.length) return this;
    let rows = this.rows;
    for (const [id] of changed) {
      const previous = this.entities.get(id);
      if (previous) for (const from of sources(previous)) {
        rows = rows.set(from, Object.freeze((rows.get(from) ?? EMPTY).filter(edge => edge.to !== id)));
      }
    }
    for (const [, next] of changed) if (next) for (const edge of edges(next)) {
      rows = rows.set(edge.from, Object.freeze([...(rows.get(edge.from) ?? EMPTY), edge]));
    }
    for (const [id, next] of changed) {
      if (!next && (rows.get(id)?.length ?? 0)) {
        const edge = rows.get(id)[0];
        throw new Error(`Workshop entity ${edge.to} has missing ${edge.type === 'PARENT' ? 'parent' : 'dependency'} ${id}.`);
      }
      if (next) for (const from of sources(next)) {
        if (!entities.has(from)) throw new Error(`Workshop entity ${id} has missing ${next.parentId === from ? 'parent' : 'dependency'} ${from}.`);
      }
      const visiting = new Set();
      let current = next;
      while (current) {
        if (visiting.has(current.id)) throw new Error(`Workshop parent hierarchy contains a cycle at ${current.id}.`);
        visiting.add(current.id);
        current = entities.get(current.parentId);
      }
    }
    return new WorkshopTopology(entities, rows, changed.map(([id]) => id), this);
  }
  outgoing(id) { return this.rows.get(id) ?? EMPTY; }
  incoming(id) { const entity = this.entities.get(id); return entity ? edges(entity) : EMPTY; }
  assertDag() {
    if (this.#validated) return;
    // A validated base plus changed incoming edges needs only ancestor walks.
    this.#base?.assertDag();
    const done = new Set(), visiting = new Set();
    const visit = id => {
      if (done.has(id)) return;
      if (visiting.has(id)) throw new Error(`Workshop dependency graph contains a cycle: ${id}.`);
      visiting.add(id);
      for (const source of sources(this.entities.get(id))) visit(source);
      visiting.delete(id); done.add(id);
    };
    for (const id of this.changed ?? [...this.entities].map(([id]) => id)) if (this.entities.has(id)) visit(id);
    this.#validated = true;
    // Once validated, no predecessor document/topology needs to remain alive.
    this.#base = null;
  }
  affectedIds(ids) {
    const queue = [...new Set(ids)].filter(id => this.entities.has(id));
    const affected = new Set(queue);
    for (let head = 0; head < queue.length; head++) for (const edge of this.outgoing(queue[head])) {
      if (!affected.has(edge.to)) { affected.add(edge.to); queue.push(edge.to); }
    }
    return [...affected];
  }
  order() {
    if (this.#order) return this.#order;
    this.assertDag();
    const degrees = new Map([...this.entities].map(([id, entity]) => [id, sources(entity).length]));
    const ready = [...degrees].filter(([, degree]) => degree === 0).map(([id]) => id).sort();
    const order = [];
    while (ready.length) {
      const id = ready.shift(); order.push(id);
      const dependents = [...new Set(this.outgoing(id).map(edge => edge.to))].sort();
      for (const dependent of dependents) {
        const degree = degrees.get(dependent) - 1; degrees.set(dependent, degree);
        if (degree === 0) {
          let index = 0;
          while (index < ready.length && ready[index].localeCompare(dependent) < 0) index++;
          ready.splice(index, 0, dependent);
        }
      }
    }
    this.#order = Object.freeze(order);
    this.#ranks = new Map(order.map((id, i) => [id, i]));
    return this.#order;
  }
  ordered(ids) { this.order(); return [...ids].sort((a, b) => this.#ranks.get(a) - this.#ranks.get(b)); }
}
