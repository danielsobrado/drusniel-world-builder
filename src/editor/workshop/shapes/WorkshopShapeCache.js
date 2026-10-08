import { createProceduralWorkshopComponentParts } from '../ProceduralWorkshopComponentParts.js';
import { disposeModelParts } from '../../assets/modelParts.js';
import { shapeProductDomains, shapeProductKey } from './ShapeProductDomains.js';

/** Stage domain products atomically; scene owners detach old meshes before disposal. */
export class WorkshopShapeCache {
  constructor({
    build = createProceduralWorkshopComponentParts,
    dispose = disposeModelParts,
  } = {}) {
    this.build = build;
    this.dispose = dispose;
    this.entries = new Map();
    this.stats = { rebuilt: 0, reused: 0, rebuiltDomains: 0, generationMs: 0 };
  }

  update(recipe, plans) {
    const staged = new Map(),
      created = [],
      removed = [],
      start = performance.now();
    let rebuilt = 0,
      reused = 0,
      rebuiltDomains = 0;
    try {
      for (const plan of plans) {
        const old = this.entries.get(plan.id),
          domains = new Map();
        let changed = false;
        for (const domain of shapeProductDomains(plan, recipe)) {
          const key = shapeProductKey(recipe, plan, domain),
            previous = old?.domains.get(domain);
          if (previous?.key === key) {
            domains.set(domain, previous);
            continue;
          }
          const parts = this.build(
            {
              ...recipe,
              componentTransforms: {},
              openingAttachments: {},
              openingAssemblies: {},
              composition: { version: 1, primitives: [plan.primitive] },
            },
            { resolvedShapePlans: [plan], shapeDomains: [domain] },
          );
          created.push(parts);
          domains.set(domain, { key, parts });
          changed = true;
          rebuiltDomains++;
        }
        if (old && old.domains.size !== domains.size) changed = true;
        if (!changed && old) {
          staged.set(plan.id, old);
          reused++;
        } else {
          staged.set(plan.id, {
            plan,
            domains,
            parts: [...domains.values()].flatMap((value) => value.parts),
          });
          rebuilt++;
        }
      }
    } catch (error) {
      for (const parts of created) this.dispose(parts);
      throw error;
    }
    for (const [id, entry] of this.entries) {
      const next = staged.get(id);
      if (next === entry) continue;
      const retired = [...entry.domains.entries()]
        .filter(([domain, value]) => next?.domains.get(domain) !== value)
        .map(([, value]) => value.parts);
      removed.push({ id, entry: { parts: retired.flat() } });
    }
    const previous = this.entries;
    this.entries = staged;
    this.stats = {
      rebuilt,
      reused,
      rebuiltDomains,
      generationMs: performance.now() - start,
    };
    return { entries: staged, previous, removed, stats: this.stats };
  }

  releaseRemoved(result) {
    for (const { entry } of result.removed) this.dispose(entry.parts);
  }

  clear() {
    for (const entry of this.entries.values()) this.dispose(entry.parts);
    this.entries.clear();
  }
}
