/** A dependency is pending: yield this value to stop polling until the next frame. */
export const ITERATOR_PENDING = Symbol('iterator-pending');

/** A factory is invoked on the first budgeted step, never on a lookup. */
export function createIteratorBuilder(factory) {
  let iterator = null;
  let result = null;
  return {
    get done() { return result !== null; },
    step({ shouldYield = null } = {}) {
      if (result !== null) return result;
      if (shouldYield?.()) return null;
      iterator ??= factory();
      while (!shouldYield?.()) {
        const next = iterator.next();
        if (next.value === ITERATOR_PENDING) return null;
        if (next.done) {
          result = next.value;
          return result;
        }
      }
      return null;
    },
  };
}

export function completeIterator(iterator) {
  let next = iterator.next();
  while (!next.done) next = iterator.next();
  return next.value;
}
