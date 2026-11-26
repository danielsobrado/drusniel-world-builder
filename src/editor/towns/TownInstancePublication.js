import { markAttributeSubrangeUpdated } from '../stylized/attributeUpload.js';
import { PerfCounters } from '../performance/qa/PerfCounters.js';

/** Dirty slots are sorted and unique; pending ranges survive until the draw uploads them. */
export function writeTownInstanceRows(meshes, matrices, colours, placementAt, count, dirty) {
  for (const mesh of meshes) {
    for (const slot of dirty) {
      const index = placementAt[slot];
      const target = slot * 16, source = index * 16;
      for (let i = 0; i < 16; i++) mesh.instanceMatrix.array[target + i] = matrices[source + i];
      if (mesh.instanceColor) {
        const targetColor = slot * 3, sourceColor = index * 3;
        for (let i = 0; i < 3; i++) mesh.instanceColor.array[targetColor + i] = colours[sourceColor + i];
      }
    }
    mesh.count = count;
    PerfCounters.inc('townInstanceRowsCopied', dirty.length);
    for (let start = 0; start < dirty.length;) {
      let end = start;
      while (end + 1 < dirty.length && dirty[end + 1] === dirty[end] + 1) end++;
      markAttributeSubrangeUpdated(mesh.instanceMatrix, dirty[start], dirty[end]);
      markAttributeSubrangeUpdated(mesh.instanceColor, dirty[start], dirty[end]);
      start = end + 1;
    }
  }
}

export const WAIT_FOR_TOWN_PUBLICATION = 'wait-for-town-publication';

// A publication can merge queued ranges into one span. Bound the extra bytes
// conservatively without assuming that a hidden mesh has consumed its ranges.
export function estimateTownPublicationBytes(meshes, dirty) {
  if (!dirty.length) return 0;
  let min = Infinity, max = -1;
  for (const slot of dirty) {
    min = Math.min(min, slot);
    max = Math.max(max, slot);
  }
  let bytes = 0;
  for (const mesh of meshes) {
    for (const attribute of [mesh.instanceMatrix, mesh.instanceColor]) {
      if (!attribute) continue;
      const ranges = attribute.updateRanges ?? [];
      if (ranges.length + dirty.length <= 8) {
        bytes += dirty.length * attribute.itemSize * attribute.array.BYTES_PER_ELEMENT;
      } else {
        let start = min * attribute.itemSize, end = (max + 1) * attribute.itemSize;
        for (const range of ranges) {
          start = Math.min(start, range.start);
          end = Math.max(end, range.start + range.count);
        }
        bytes += (end - start) * attribute.array.BYTES_PER_ELEMENT;
      }
    }
  }
  return bytes;
}
