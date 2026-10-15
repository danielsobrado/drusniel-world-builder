# Composition capture selector failure — October 15, 2026

This run is **failed**, not release acceptance. Runtime source was frozen at
`282d1958`. All 36 preceding poses reached the full readiness gate with zero
browser errors. At `marine-coast-overview`, terrain, scenery and collision were
also ready, but `canvas.first()` selected a hidden canvas. The failed screenshot
shows the actual world still rendering. The original raw report is retained.

The remaining screenshots declared in that raw report remain local under
`tmp/world-visual-quality/after/composition-path-cleared/`; they are not adjacent
to this copied failure report. They have not been promoted to final acceptance.

Commit `40bfb889` replaces the ambiguous selector with the renderer's actual DOM
element. An aerial/imported rerun is still required. No pose, timeout, readiness
predicate or visual threshold was relaxed.
