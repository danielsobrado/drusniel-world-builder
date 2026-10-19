import { PerfCounters } from '../../performance/qa/PerfCounters.js';

/** Actual page writes share one frame allowance, including retirement repacks.
 * One oversized page may progress on an otherwise empty frame, as a dense tile
 * already could. Origin maintenance is mandatory and suppresses optional work. */
export class MeadowPublicationBudget {
  constructor(limit = Infinity) { this.limit = limit; this.used = 0; }
  reset(limit) { this.limit = limit; this.used = 0; }
  take(bytes) {
    if (!bytes) return true;
    if (this.used > 0 && this.used + bytes > this.limit) return false;
    if (bytes > this.limit) PerfCounters.inc('meadowOversizedPageBytes', bytes);
    this.used += bytes;
    PerfCounters.inc('meadowBatchPublicationBytes', bytes);
    return true;
  }
  rebase(bytes) {
    this.used += bytes;
    PerfCounters.inc('meadowOriginMaintenanceBytes', bytes);
    PerfCounters.inc('meadowBatchPublicationBytes', bytes);
  }
}
