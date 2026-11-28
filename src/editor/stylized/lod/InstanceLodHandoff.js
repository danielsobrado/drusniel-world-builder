import { acquireInitialInstanceHandoff } from '../../../render/preparation/InitialInstancePreparation.js';
import { PerfCounters } from '../../performance/qa/PerfCounters.js';
import { ITERATOR_PENDING } from '../ResumableIterator.js';

/** One outstanding lease per publication, with a single deadline for the whole handoff. */
export function* waitForInitialInstanceDraws(meshes, acquire = acquireInitialInstanceHandoff, now = () => performance.now()) {
  let deadline = null;
  for (const mesh of meshes) {
    const lease = acquire(mesh);
    if (!lease) continue;
    deadline ??= now() + lease.timeoutMs;
    const acquiredAt = now();
    let completed = false;
    try {
      while (!lease.ready()) {
        if (now() >= deadline) {
          PerfCounters.inc('sceneryLodHandoffTimeouts');
          return;
        }
        PerfCounters.inc('sceneryLodHandoffDeferred');
        yield ITERATOR_PENDING;
      }
      completed = true;
      PerfCounters.inc('sceneryLodHandoffDrawsReady');
    } finally {
      const ageMs = Math.max(0, now() - acquiredAt);
      PerfCounters.inc('sceneryLodHandoffLeaseMs', ageMs);
      PerfCounters.inc('sceneryLodHandoffLeases');
      if (completed) PerfCounters.inc('sceneryLodHandoffReadyWaitMs', ageMs);
      PerfCounters.set('sceneryLodHandoffMaxLeaseMs', Math.max(PerfCounters.get('sceneryLodHandoffMaxLeaseMs'), ageMs));
      lease.release();
      if (!completed) PerfCounters.inc('sceneryLodHandoffAbandonedDraws');
    }
  }
}
