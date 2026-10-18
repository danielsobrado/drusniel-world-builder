export function drainJob(job) {
  for (;;) { const step = job.next(); if (step.done) return step.value; }
}
export function* typedArrayJob(values, Type = Float32Array) {
  const output = new Type(values.length);
  for (let start = 0; start < values.length; start += 4096) {
    const end = Math.min(start + 4096, values.length);
    for (let i = start; i < end; i++) output[i] = values[i];
    yield;
  }
  return output;
}
