/** Stable stem ranks are ordered, so a lower-density band is an exact prefix. */
export function compactionPrefix(output, capacity) {
  let low = 0, high = output.count;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (output.data[middle * 4 + 1] < capacity) low = middle + 1;
    else high = middle;
  }
  return { position: output.position, rotation: output.rotation, data: output.data, count: low };
}
