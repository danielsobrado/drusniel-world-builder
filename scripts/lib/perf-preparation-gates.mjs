/** A saved diagnostic may contain useful data after timeout, but must fail QA. */
export function perfPreparationFailures(report, settleRequired = false) {
  const failures = [];
  for (const [label, capture] of [['initial', report], ['revisit', report.revisit]]) {
    if (!capture) continue;
    if ((settleRequired || capture.scenario?.settle != null) && capture.scenario?.settle?.settled !== true) {
      failures.push(`${label}: preparation did not settle before measurement`);
    }
    if (capture.preparation?.start?.ready === false) failures.push(`${label}: incomplete scenery at measurement start`);
  }
  return failures;
}
