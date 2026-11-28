/**
 * Holds a warmup open until the world has stopped loading.
 *
 * A time-based warmup ends on the clock, and the first frame after a cold start
 * can itself take 25–30 s to compile. On a slow or shared machine the
 * measurement then began with terrain streaming, collision builds and wall
 * builds still in flight, and the numbers described start-up rather than the
 * scenario: a corridor run once recorded 29 frames at 3 FPS with the player
 * standing still, waiting for collision. With the gate, the warmup ends only
 * once every readiness check has held for `requiredFrames` consecutive frames,
 * or after `timeoutSeconds`, which the report records as a failed settle.
 */
export class PerfQaSettleGate {
  constructor({ requiredFrames = 60, timeoutSeconds = 120 } = {}) {
    this.requiredFrames = requiredFrames;
    this.timeoutSeconds = timeoutSeconds;
    this.streak = 0;
    this.blockers = [];
    this.lastBlockers = [];
    this.maxStreak = 0;
    this.checks = 0;
    this.blockedChecks = {};
  }

  /**
   * @param {Record<string, boolean>} readiness one flag per check
   * @param {number} waitedSeconds time spent waiting past the warmup
   * @returns {'waiting' | 'settled' | 'timeout'}
   */
  update(readiness, waitedSeconds) {
    const blockers = Object.keys(readiness).filter((name) => !readiness[name]);
    this.streak = blockers.length === 0 ? this.streak + 1 : 0;
    this.checks++;
    this.maxStreak = Math.max(this.maxStreak, this.streak);
    this.blockers = blockers;
    if (blockers.length > 0) this.lastBlockers = blockers;
    for (const name of blockers) this.blockedChecks[name] = (this.blockedChecks[name] ?? 0) + 1;
    if (this.streak >= this.requiredFrames) return 'settled';
    if (waitedSeconds >= this.timeoutSeconds) return 'timeout';
    return 'waiting';
  }
}
