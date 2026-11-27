import { markAttributeSubrangeUpdated } from '../stylized/attributeUpload.js';
import { PerfCounters } from '../performance/qa/PerfCounters.js';
import { InstancePublicationPlan } from '../stylized/lod/InstancePublicationPlan.js';
import { ITERATOR_PENDING } from '../stylized/ResumableIterator.js';

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

/** Keep resident selections unchanged until all their sliced GPU copies can publish together. */
export function* publishTownSelections(selections, matrices, colours, budget = null, isCurrent = () => true, allowSlicing = true) {
  const bytesFor = () => selections.reduce((bytes, item) => bytes + estimateTownPublicationBytes(item.meshes, item.dirty), 0);
  const uploader = allowSlicing && budget?.slicedInstanceUploads;
  if (uploader && budget.settings?.enabled && bytesFor() > uploader.settings.sliceBytes) {
    const publication = new InstancePublicationPlan();
    for (const { meshes, indices, dirty } of selections) {
      if (!dirty.length) continue;
      for (const mesh of meshes) {
        let units = 0;
        for (const slot of dirty) {
          if (!isCurrent()) return false;
          const index = indices[slot];
          publication.record(mesh.instanceMatrix, slot, matrices.subarray(index * 16, index * 16 + 16));
          if (mesh.instanceColor) publication.record(mesh.instanceColor, slot, colours.subarray(index * 3, index * 3 + 3));
          if (++units % 64 === 0) yield;
        }
        const range = { min: dirty[0], max: dirty[dirty.length - 1] };
        publication.span(mesh.instanceMatrix, range);
        if (mesh.instanceColor) publication.span(mesh.instanceColor, range);
      }
    }
    const iterator = uploader.stage(publication, () => budget, isCurrent);
    try {
      let step = iterator.next();
      while (!step.done) {
        if (!isCurrent()) return false;
        yield step.value === ITERATOR_PENDING ? WAIT_FOR_TOWN_PUBLICATION : step.value;
        step = iterator.next();
      }
      if (step.value) {
        publication.commit(true);
        for (const { meshes, count, dirty } of selections) for (const mesh of meshes) {
          mesh.count = count;
          PerfCounters.inc('townInstanceRowsCopied', dirty.length);
        }
        PerfCounters.inc('townSlicedPublicationCommits');
        return true;
      }
    } finally { iterator.return(); }
    if (!isCurrent()) return false;
    PerfCounters.inc('townSlicedPublicationFallbacks');
  }
  if (budget?.canPublish) {
    while (isCurrent() && !budget.canPublish(bytesFor())) yield WAIT_FOR_TOWN_PUBLICATION;
  }
  if (!isCurrent()) return false;
  for (const { meshes, indices, count, dirty } of selections) writeTownInstanceRows(meshes, matrices, colours, indices, count, dirty);
  return true;
}
