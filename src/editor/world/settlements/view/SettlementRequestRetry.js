/** Only explicitly transient failures retry; invalid data remains terminal. */
export class SettlementRequestRetry {
  constructor({ now = () => performance.now(), maxAttempts = 3, delayMs = 250 } = {}) {
    Object.assign(this, { now, maxAttempts, delayMs });
  }
  fail(request, error) {
    request.error = error;
    request.job = null;
    request.retryAt = error.retryable === true && request.attempts < this.maxAttempts
      ? this.now() + this.delayMs * 2 ** (request.attempts - 1) : Infinity;
  }
  due(request) { return Boolean(request.error) && this.now() >= request.retryAt; }
}
