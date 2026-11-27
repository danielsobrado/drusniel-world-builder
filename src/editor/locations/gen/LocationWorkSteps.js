const yieldTask = () => new Promise(resolve => setTimeout(resolve, 0));

export function finishLocationSteps(iterator) {
  let step = iterator.next();
  while (!step.done) step = iterator.next();
  return step.value;
}

/** Keep one iterator and its global data alive across task boundaries. */
export async function runLocationSteps(iterator, sliceMs, {
  signal, clock = () => performance.now(), pause = yieldTask, onYield = () => {},
} = {}) {
  let completed = false;
  try {
    let started = clock();
    for (;;) {
      signal?.throwIfAborted();
      const step = iterator.next();
      if (step.done) {
        completed = true;
        return step.value;
      }
      if (clock() - started >= sliceMs) {
        onYield();
        await pause();
        started = clock();
      }
    }
  } finally {
    if (!completed) iterator.return?.();
  }
}
