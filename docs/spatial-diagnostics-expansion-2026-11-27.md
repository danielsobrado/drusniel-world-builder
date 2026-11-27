# Spatial diagnostics expansion

Base: a58a66f1c6cd3be2118ba39192b16d62a49610a8. No GitHub Actions.

Activate with `?spatialPerformanceOverlay=1`. For GPU samples also enable `measuredGpuAdmission=1`; compute credits require `gpuComputeAdmission=1`. Existing diagnostic refresh interval and radius apply. No admission or quality changes.

- Top five selectable hotspots within the displayed window, deterministic ordering. Additional selected shadow/reflection triangle metrics use existing conservative geometry estimates.
- Separate live assigned terrain/water slot snapshot, including material names, pending material, loading and water coverage. Accounted bytes use renderer memoryMap, estimates use the existing texture-size estimator only for manager-known allocations. Shared textures are excluded from per-chunk totals; unknown and unallocated resources are distinct. Slot assignment is not proof of current page contents or visible GPU allocation.
- Texture heatmap is all layers, relative to maximum in window; it is not a budget ratio. Shared atlases, geometry, transient scratch, and global render targets are not charged to chunks.
- Renderer snapshot captures CPU, publication, streaming queue, GPU memory, draw counts, compute credits, per-workload cumulative totals, auxiliary counters and timestamp samples with age. Missing counters are null rather than fabricated zero. Renderer totals may cover multiple passes or reset intervals according to Three's accounting.
- Export version 2 retains prior spatial data and adds separately timestamped slot resources and renderer snapshot, using displayed samples rather than reading changing counters on export. No scene traversal, GPU readback, allocations of render resources or new per-frame observers. Snapshot work runs only at existing overlay refresh when open; selection changes reuse it.

## Verification

```sh
npm ci
node --test test/spatial-resource-snapshot.test.js test/spatial-performance-overlay.test.js test/regional-render-cost.test.js
npm run lint
npm test
npm run build
```

Compare headed routes with overlay closed/open; inspect known wet, dry, loading and dense town chunks, negative coordinates, teleport and origin changes. Compare export timestamps, actual renderer accounting and material selection. Confirm collapse stops observer-only sampling and reopening refreshes. Record overlay CPU cost. No measured per-chunk GPU timings, instruction counts or complete per-chunk VRAM accounting; these remain TODO. No hardware acceptance claimed.
