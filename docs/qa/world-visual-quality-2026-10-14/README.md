# World visual quality evidence

**Release acceptance is blocked.** The complete VQ-01–13 task status is in the
[implementation report](../world-visual-quality-implementation-2026-10-14.md).
The fixed requirements remain in the [original implementation specification](../../plans/world-visual-quality-plan-2026-10-13.md).

- [Ocean repetition review and before/after comparison](ocean/README.md): tested
  application source `9b768d9a`, both renderer backends, full repository checks.
- [Lighting matrix](lighting/report.json): 36 views, zero browser errors.
- [Meadow LOD checks](fixtures/meadow-lod/report.json): 27 comparisons per backend.
- [Temporal checks](fixtures/temporal/report.json): actual production tree and
  cinematic owner, timed pan and recovery, both backends.
- [Remaining aerial/imported composition views](biomes/composition-remaining/README.md):
  all 17 passed on the current application source, including the final source check.
- [Valid motion recovery failure](motion/smoke-v2/README.md): both camera modes
  complete, but requested scenery misses the two-second stop limit.
- [Original aerial capture-selector failure](biomes/capture-selector-failure/README.md)
  and [later server/source-check failure](biomes/composition-source-check-failure/README.md)
  remain visible; neither is relabelled as a passing suite.

The runtime loaded in each browser is identified separately from the Node
capture harness. Newer reports contain both provenance records. The full motion
videos remain local under `tmp/world-visual-quality/after/motion-smoke-v2/`;
their hashes and committed state/contact-sheet evidence are retained in the
motion report.

The primary unmet acceptance condition is requested scenery after the sprint
at original-04: the first-person and third-person 10–12 s stops never reach
complete readiness within the required two seconds. Near grass publishes during
that stop, while other requested meadow work continues. The third-person
initial preparation deadlock was corrected separately. Preserve the current
density, budgets, timeout and readiness definition when investigating recovery.

The resource peak baseline, final comparative performance, four-light numerical
surface/tree reruns, complete aggregate execution and listed legacy regressions
also remain required. See the implementation report for the exact completed
evidence and outstanding gates. Passing ocean or unit checks does not clear
those release requirements.
