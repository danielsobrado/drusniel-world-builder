import { PerfCounters } from '../editor/performance/qa/PerfCounters.js';

export const LOD_DIRECT_SUBMISSION_COUNTERS = Object.freeze([
  'lodDirectDraws', 'lodDirectDrawsWithFade', 'lodDirectInstances', 'lodDirectFadingInstances',
  'lodDirectZeroFadeInstances', 'lodDirectTriangles', 'lodDirectFadingTriangles', 'lodIndirectDrawsUnmeasured',
]);

/** Diagnostic-only logical geometry submissions, not rasterized pixels or GPU time. */
export class LodDirectSubmissionDiagnostics {
  constructor() { this.cache = new WeakMap(); }

  observe(renderObject) {
    const { object, geometry, group, material } = renderObject;
    const dither = geometry?.getAttribute?.('instanceDither');
    if (!dither || !object?.isInstancedMesh || !(object.count > 0)) return;
    if (geometry.indirect || renderObject.getIndirect?.() || object.isBatchedMesh) {
      PerfCounters.inc('lodIndirectDrawsUnmeasured');
      return;
    }
    if (material?.wireframe || object.isLine || object.isPoints) return;
    const count = object.count;
    if (!Number.isSafeInteger(count) || count > dither.count || !dither.array || dither.itemSize < 1) return;
    const available = geometry.index?.count ?? geometry.getAttribute('position')?.count ?? 0;
    const range = geometry.drawRange ?? { start: 0, count: Infinity };
    const start = Math.max(0, range.start, group?.start ?? 0);
    const end = Math.min(available, range.start + range.count, group ? group.start + group.count : Infinity);
    const triangles = Math.floor(Math.max(0, end - start) / 3);
    if (!triangles) return;
    let row = this.cache.get(dither);
    if (!row || row.version !== dither.version || row.count !== count) {
      let fading = 0, zero = 0;
      for (let i = 0; i < count; i++) {
        const fade = Math.abs(dither.array[i * dither.itemSize]);
        if (fade === 0) zero++;
        else if (fade < 1) fading++;
      }
      row = { version: dither.version, count, fading, zero };
      this.cache.set(dither, row);
    }
    PerfCounters.inc('lodDirectDraws');
    PerfCounters.inc('lodDirectInstances', count);
    PerfCounters.inc('lodDirectTriangles', triangles * count);
    if (row.fading || row.zero) PerfCounters.inc('lodDirectDrawsWithFade');
    if (row.fading) {
      PerfCounters.inc('lodDirectFadingInstances', row.fading);
      PerfCounters.inc('lodDirectFadingTriangles', triangles * row.fading);
    }
    if (row.zero) PerfCounters.inc('lodDirectZeroFadeInstances', row.zero);
  }
}
