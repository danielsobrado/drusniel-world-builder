# Underground surface GPU reclamation — reversible texture stage

Base: 1cc6ae93fb3ff28d1b92406939cb86dd08aa3045. No GitHub Actions.

## Activation

```text
?locationSurfaceReclamation=1
```

Independent of cave geometry streaming. Off by default. Only the pinned Three r187 WebGPU texture lifecycle is supported.

## Ownership and lifecycle

The world frame loop already stops while a location is active. After a successful entry and five seconds of dwell, sample every 500 ms. Consider only explicit CPU-backed terrain slot tile, height, mask and forest-floor textures, plus water slot field, flow, appearance and obstacle textures. Skip render targets, storage textures, mipmapped textures, unknown layouts, loading slots, pending preparation and textures shared by a protected slot. Protect the return anchor using distance to the slot footprint, not just its center. Keep the original canonical anchor across linked location transitions.

Retire up to four textures per sample, farthest first, capped at 32 MiB of source payload. The Three texture disposal event releases renderer resources and invalidates bind groups; CPU arrays and slot references are unchanged. No material or visibility changes. Actual GPU allocation bytes may differ from source payload due to format conversion, alignment, and backend accounting.

On exit stop retirement and restore tracked textures nearest first behind the loading screen, before swapping to the surface. Use renderer.initTexture on current CPU data with at most four textures and 2 MiB of source payload per scheduling batch. No texture larger than the restore byte target is retired. A frame yield separates batches. Aborting the transition on runtime teardown prevents additional uploads; an ordinary restore failure falls back to the normal renderer first-use upload path. A device loss leaves recovery to the existing recovery path. No strict GPU completion fence or CPU time guarantee is added.

The cave scene remains active during warmup, so the peak during return can include both cave allocations and restored surface allocations. No guarantee of lower exit latency. Only committed surface slot textures are targeted: geometry shared by slot bounds wrappers must never be disposed independently, and GPU-produced textures cannot be restored by copying CPU data.

## Configuration

```yaml
locationStructureBudget:
  surfaceReclamationEnabled: false
  surfaceProtectMeters: 192
  surfaceIdleMs: 5000
  surfaceSampleMs: 500
  surfaceEvictionsPerSample: 4
  surfaceMaxEvictedBytes: 33554432
  surfaceRestoreBytesPerFrame: 2097152
  surfaceRestoresPerFrame: 4
```

Counters: locationSurface.evictions, locationSurface.evictedBytes, locationSurface.pendingTextures, locationSurface.pendingBytes, locationSurface.restores, locationSurface.restoredBytes, locationSurface.restoreFailures.

## Acceptance

```sh
npm ci
node --test test/location-surface-residency.test.js
npm run lint
npm test
npm run build
```

Seven tests cover dwell and limits, return order, pending and shared protection, linked entry, cancellation, fail-open errors, configuration. Browser validation must compare identical routes with flag off and on: enter from dry and coastal terrain, wait > 5s, travel through linked locations, return and revisit. Record renderer memory, source-payload counters, GPU/CPU frame tails, return time, screenshots, vegetation and water field integrity. Test quick return, failed entry, disposal during return and device loss. Compare actual accounting before/during/after. Do not assume 32 MiB savings; eligible resident textures may be smaller or all protected.

## Remaining

TODO: owner-specific retirement for inactive vegetation and rock pages, including CPU-authoritative instance state and GPU compute regeneration.
TODO: town resource ownership and restore integration, GPU-generated terrain bake textures, ocean FFT state, reflection targets and atmospheric resources. Avoid blanket scene disposal or releasing shared geometry attributes.
TODO: profile peak cave entry memory; this stage starts after successful entry and does not reclaim resources during cave preparation.
