import { createMovementPlan, parseQaParams } from '../../src/editor/performance/qa/parseQaParams.js';

/** Allow the browser's entire warmup/settle/measurement route plus startup. */
export function defaultPerfQaTimeoutMs(query) {
  const config = parseQaParams(query);
  if (!config) throw new Error('Performance QA timeout requires a QA scenario.');
  const settleSeconds = config.settle ? config.settleTimeoutSeconds : 0;
  const plan = createMovementPlan(config);
  const routeSeconds = plan.phases.reduce((total, phase) => total + (Number.isFinite(phase.durationFrames)
    ? phase.durationFrames / 60 : phase.durationSeconds), 0);
  return (Math.max(config.warmupSeconds + config.durationSeconds, routeSeconds) + settleSeconds + 90) * 1000;
}
