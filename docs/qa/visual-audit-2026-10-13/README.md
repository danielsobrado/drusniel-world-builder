# Random biome visual audit

Read the [visual quality plan](../../plans/world-visual-quality-plan-2026-10-13.md)
for the screenshot inventory, observations, priorities and acceptance criteria.

This folder contains twelve original 1600 × 900 JPEG screenshots of natural
locations in the default procedural world, one for each land-biome ID `1–12`.
They were captured on October 13, 2026; the review was completed on October 14.

- [Capture state](procedural-captures.json): canonical locations, camera poses,
  verified biome IDs, resolved sky values, terrain and scenery readiness.
- [Provenance](provenance.json): source revision, world and sampling seeds,
  hardware/backend, configuration hash, image hashes and capture limitations.

**These are visual review snapshots, not passing performance captures.** Terrain,
collision and material preparation completed, but every shot retained one
scenery queue entry; spot checks identified the bush queue. No retained capture
passed the full scenery settle gate. Exact vegetation population remains
provisional. Wind and regional particles were live, and the HUD was retained.

To revisit a shot, load the default world with seed `918273`, use its recorded
canonical X/Z and yaw/pitch, choose Highfield, pause the clock at 12:00, and use
a 1600 × 900 viewport with first-person FOV 68°. Convert canonical coordinates
through the current floating origin. For automated camera cuts, the capture
harness reset `terrainView.lastFocus` / `lastFocusTimestamp`, requested
`updateStreamingFrame({x, z}, performance.now(), true)`, repositioned in free
flight, then entered player mode. It waited 16 seconds and allowed 30 more
seconds for 60 consecutive ready frames, recording the actual timeout outcome.
Resetting the predictor is a capture workaround, not a verified teleport fix.

For performance or before/after approval, first fix or isolate the outstanding
readiness issue and follow [the performance QA guide](../../perf-qa.md). Preserve
these originals; put new captures in a separate folder.
