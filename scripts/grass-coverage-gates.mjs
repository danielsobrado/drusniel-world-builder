export const GRASS_RECOVERY_TARGET_MS = 2000;

/** Frame throughput cannot excuse grass that remains missing after a stop. */
export function evaluateGrassCoverage(report) {
  const failures = [];
  const recovery = report?.recovery;
  const number = value => typeof value === 'number' && Number.isFinite(value);
  const endpoint = counters => ({
    missing: counters?.meadowInViewMissingTiles,
    capacityLag: counters?.meadowInViewCapacityLagTiles,
  });
  const movementEnd = endpoint(report?.counters);
  const recoveryEnd = endpoint(recovery?.counters);
  if (![movementEnd.missing, movementEnd.capacityLag, recoveryEnd.missing, recoveryEnd.capacityLag].every(number)) {
    failures.push('grass coverage observations are missing');
  }
  if (recovery?.ready !== true || !number(recovery.firstReadyMs)
      || recovery.firstReadyMs > GRASS_RECOVERY_TARGET_MS) {
    failures.push(`scenery did not recover within ${GRASS_RECOVERY_TARGET_MS} ms`);
  }
  if (recoveryEnd.missing !== 0 || recoveryEnd.capacityLag !== 0) {
    failures.push('in-view grass remained missing or below requested density after recovery');
  }
  return { passed: failures.length === 0, maximumRecoveryMs: GRASS_RECOVERY_TARGET_MS,
    movementEnd, recoveryEnd, firstReadyMs: recovery?.firstReadyMs ?? null, failures };
}
