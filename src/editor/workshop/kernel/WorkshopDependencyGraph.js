import { normalizeWorkshopDocument } from './WorkshopDocument.js';

export class WorkshopDependencyGraph {
  constructor(documentInput) {
    this.document = normalizeWorkshopDocument(documentInput);
    this.topology = this.document.topology;
    this.topology.assertDag();
    Object.freeze(this);
  }

  dependenciesOf(id) {
    return Object.freeze([...new Set(this.topology.incoming(id).map(edge => edge.from))].sort());
  }
  dependentsOf(id) {
    return Object.freeze([...new Set(this.topology.outgoing(id).map(edge => edge.to))].sort());
  }
  affectedIds(ids) { return this.topology.affectedIds(ids); }
  affected(ids) { return Object.freeze(this.topology.ordered(this.affectedIds(ids))); }
  topologicalOrder(ids = null) {
    if (ids === null) return this.topology.order();
    return Object.freeze(this.topology.ordered(new Set([...ids].filter(id => this.document.hasEntity(id)))));
  }
}
